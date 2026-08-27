/**
 * Database access layer.
 *
 * The security incident this replaces was caused by the organization ID being
 * an ambient, caller-supplied value. The fix is structural rather than a patch:
 * `TenantDb` cannot be constructed without an organization ID that came from a
 * verified session, and repositories only ever receive a `TenantDb`. There is
 * no code path that reads tenant data without a tenant scope.
 *
 * `PlatformDb` exists for the few genuinely cross-tenant operations (login
 * lookup by email, scheduled jobs, super-admin reporting) and is deliberately
 * separate and explicit so those call sites are easy to audit.
 */

export type Row = Record<string, unknown>;

export class DatabaseError extends Error {
  constructor(message: string, cause?: unknown) {
    // `cause` goes through the standard Error option rather than a class field:
    // Error already declares it, so redeclaring it here shadows the built-in.
    super(message, { cause });
    this.name = "DatabaseError";
  }
}

/** Thrown when a lookup by ID succeeds in SQL but the row belongs elsewhere. */
export class NotFoundError extends Error {
  constructor(entity: string) {
    super(`${entity} not found`);
    this.name = "NotFoundError";
  }
}

abstract class BaseDb {
  protected constructor(protected readonly d1: D1Database) {}

  protected async runQuery<T>(sql: string, params: unknown[], mode: "first"): Promise<T | null>;
  protected async runQuery<T>(sql: string, params: unknown[], mode: "all"): Promise<T[]>;
  protected async runQuery<T>(sql: string, params: unknown[], mode: "run"): Promise<D1Result>;
  protected async runQuery<T>(
    sql: string,
    params: unknown[],
    mode: "first" | "all" | "run"
  ): Promise<T | null | T[] | D1Result> {
    try {
      const statement = this.d1.prepare(sql).bind(...params);
      if (mode === "first") return (await statement.first<T>()) ?? null;
      if (mode === "all") return (await statement.all<T>()).results ?? [];
      return await statement.run();
    } catch (error) {
      // D1 error messages can contain fragments of the statement. Log the full
      // detail server-side but never surface it to the client.
      console.error("D1 query failed", { sql, error });
      throw new DatabaseError("Database query failed", error);
    }
  }

  /**
   * Runs several statements as one atomic unit. Signup previously wrote four
   * rows with four separate calls, so a failure part-way left an orphaned
   * organization behind.
   */
  async batch(statements: Array<{ sql: string; params: unknown[] }>): Promise<D1Result[]> {
    if (statements.length === 0) return [];
    try {
      return await this.d1.batch(statements.map(({ sql, params }) => this.d1.prepare(sql).bind(...params)));
    } catch (error) {
      console.error("D1 batch failed", { count: statements.length, error });
      throw new DatabaseError("Database transaction failed", error);
    }
  }
}

/**
 * Tenant-scoped database handle.
 *
 * `first`/`all`/`run` automatically append an `organization_id = ?` predicate,
 * so a forgotten tenant filter is not expressible through this interface.
 */
export class TenantDb extends BaseDb {
  constructor(
    d1: D1Database,
    readonly organizationId: string
  ) {
    if (!organizationId) throw new Error("TenantDb requires an organizationId");
    super(d1);
  }

  /**
   * Appends the tenant predicate to a query.
   *
   * The query must contain the `{where}` placeholder, which expands to either
   * `where organization_id = ?` or `and organization_id = ?` depending on
   * whether the caller already opened a WHERE clause. Requiring the marker
   * means a query that forgets tenant scoping fails loudly at development time
   * instead of silently returning another tenant's rows.
   *
   * In a join where more than one table has an `organization_id`, the column is
   * ambiguous to SQLite, so the marker takes an alias: `{where:v}` expands to
   * `and v.organization_id = ?`.
   */
  private scope(sql: string, params: unknown[]): { sql: string; params: unknown[] } {
    const match = sql.match(/\{where(?::([a-zA-Z_][a-zA-Z0-9_]*))?\}/);
    if (!match) {
      throw new Error(
        `Tenant-scoped query is missing the {where} marker. Use PlatformDb for intentionally cross-tenant queries. Query: ${sql}`
      );
    }
    const column = match[1] ? `${match[1]}.organization_id` : "organization_id";
    const preceding = sql.slice(0, match.index ?? 0);
    const keyword = /\bwhere\b/i.test(preceding) ? "and" : "where";

    // The tenant id binds at the marker's own position, not at the end of the
    // parameter list. The marker usually sits last, where the two coincide — but
    // any query with a placeholder after it (`limit ?` on every paginated read,
    // a trailing predicate on several others) gets every later value shifted by
    // one. SQLite reports that as a datatype mismatch when the types differ; when
    // they happen to agree it silently compares organization_id against whatever
    // the caller passed next, which defeats the scoping this class exists to
    // guarantee.
    const position = (preceding.match(/\?/g) ?? []).length;

    return {
      sql: sql.replace(match[0], `${keyword} ${column} = ?`),
      params: [...params.slice(0, position), this.organizationId, ...params.slice(position)]
    };
  }

  first<T = Row>(sql: string, params: unknown[] = []): Promise<T | null> {
    const scoped = this.scope(sql, params);
    return this.runQuery<T>(scoped.sql, scoped.params, "first");
  }

  all<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
    const scoped = this.scope(sql, params);
    return this.runQuery<T>(scoped.sql, scoped.params, "all");
  }

  run(sql: string, params: unknown[] = []): Promise<D1Result> {
    const scoped = this.scope(sql, params);
    return this.runQuery(scoped.sql, scoped.params, "run");
  }

  /**
   * Insert helper. Forces `organization_id` onto every row so a new table can
   * never be written without a tenant.
   */
  insert(table: string, values: Record<string, unknown>): Promise<D1Result> {
    const built = this.insertStatement(table, values);
    return this.runQuery(built.sql, built.params, "run");
  }

  /** The same forced-tenant insert, as a statement for use inside `batch`. */
  insertStatement(table: string, values: Record<string, unknown>): { sql: string; params: unknown[] } {
    const row = { ...values, organization_id: this.organizationId };
    const columns = Object.keys(row);
    const placeholders = columns.map(() => "?").join(", ");
    return {
      sql: `insert into ${table} (${columns.join(", ")}) values (${placeholders})`,
      params: Object.values(row)
    };
  }

  /** Builds a tenant-scoped statement for use inside `batch`. */
  statement(sql: string, params: unknown[] = []): { sql: string; params: unknown[] } {
    return this.scope(sql, params);
  }

  /** Fetches a row by ID, asserting it belongs to this tenant. */
  async requireById<T = Row>(table: string, id: string, entity = table): Promise<T> {
    const row = await this.first<T>(`select * from ${table} where id = ? {where}`, [id]);
    if (!row) throw new NotFoundError(entity);
    return row;
  }

  /**
   * Reads this tenant's own `organizations` row.
   *
   * `organizations` is the one tenant-owned table with no `organization_id`
   * column — its primary key *is* the tenant id. The `{where}` marker therefore
   * cannot apply to it, and using it there produced "no such column:
   * organization_id" at runtime. These two methods are the scoped way in, and
   * they supply the id themselves, so no caller can name another tenant's row
   * even by mistake.
   */
  organizationRow<T = Row>(columns = "*"): Promise<T | null> {
    return this.runQuery<T>(`select ${columns} from organizations where id = ?`, [this.organizationId], "first");
  }

  /** Updates this tenant's own `organizations` row. `assignments` is the SET clause. */
  updateOrganization(assignments: string, params: unknown[] = []): Promise<D1Result> {
    return this.runQuery(
      `update organizations set ${assignments} where id = ?`,
      [...params, this.organizationId],
      "run"
    );
  }
}

/**
 * Unscoped database handle for operations that legitimately span tenants.
 * Every use should be obvious from the call site: authentication lookups,
 * scheduled jobs, and platform administration.
 */
export class PlatformDb extends BaseDb {
  constructor(d1: D1Database) {
    super(d1);
  }

  first<T = Row>(sql: string, params: unknown[] = []): Promise<T | null> {
    return this.runQuery<T>(sql, params, "first");
  }

  all<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.runQuery<T>(sql, params, "all");
  }

  run(sql: string, params: unknown[] = []): Promise<D1Result> {
    return this.runQuery(sql, params, "run");
  }

  /** Narrows an unscoped handle to a single tenant. */
  forTenant(organizationId: string): TenantDb {
    return new TenantDb(this.d1, organizationId);
  }
}
