/**
 * Services, staff and rewards.
 *
 * The three lists that everything else depends on: a bill cannot be written
 * without services, the staff report is empty without staff, and the loyalty card
 * is pointless without a reward to work towards. Grouped on one screen with tabs
 * because they are set up once, together, in the first ten minutes.
 *
 * Nothing here is deleted. Deactivating keeps the name attached to the visits it
 * appears on, so last year's revenue does not lose its labels when a stylist
 * leaves.
 */

import { useState } from "react";
import { api } from "../../lib/api";
import { useAsync, useMutation } from "../../lib/hooks";
import { useQueryParam } from "../../lib/router";
import type { Location, Reward, Service, Staff } from "../../lib/types";
import { formatNumber, formatPhone, formatPkr } from "../../lib/format";
import {
  Button,
  Card,
  CardBody,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  LoadingBlock,
  Modal,
  NumberInput,
  PageHeader,
  Select,
  Tabs,
  TextInput,
  useToast
} from "../../components/ui";
import { useApp } from "../context";

const TABS = [
  { value: "services", label: "Services" },
  { value: "staff", label: "Team" },
  { value: "rewards", label: "Rewards" }
] as const;

type Tab = (typeof TABS)[number]["value"];

export function CatalogPage() {
  const [tabParam, setTabParam] = useQueryParam("tab");
  const tab = (TABS.find((entry) => entry.value === tabParam)?.value ?? "services") as Tab;

  return (
    <div className="pb-20 lg:pb-0">
      <PageHeader
        title="Services & team"
        subtitle="Prices, the people who do the work, and what customers can redeem."
      />

      <Card>
        <Tabs value={tab} onChange={setTabParam} tabs={TABS.map((entry) => ({ ...entry }))} />
        {tab === "services" ? <ServicesTab /> : tab === "staff" ? <StaffTab /> : <RewardsTab />}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

function ServicesTab() {
  const toast = useToast();
  const { refresh } = useApp();
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [creating, setCreating] = useState(false);
  const [deactivating, setDeactivating] = useState<Service | null>(null);

  const list = useAsync(
    (signal) =>
      api.get<{ services: Service[] }>("/api/catalog/services", { includeInactive: showInactive }, signal),
    [showInactive]
  );

  const deactivate = useMutation(async (id: string) => api.delete<{ ok: true }>(`/api/catalog/services/${id}`));

  const services = list.data?.services ?? [];

  const reloadAll = () => {
    list.reload();
    // The bootstrap payload carries the service list used by checkout.
    refresh();
  };

  return (
    <>
      <Toolbar
        count={services.length}
        noun="service"
        showInactive={showInactive}
        onToggleInactive={setShowInactive}
        onAdd={() => setCreating(true)}
        addLabel="Add a service"
      />

      {list.loading && services.length === 0 ? (
        <LoadingBlock rows={5} />
      ) : services.length === 0 ? (
        <EmptyState
          title="No services yet"
          body="Add the five or six treatments you do most often. Prices can be changed on any bill, so an approximate figure is fine to start."
          action={
            <Button onClick={() => setCreating(true)} variant="primary">
              Add a service
            </Button>
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Service</th>
                <th scope="col">Category</th>
                <th scope="col" className="text-right">Time</th>
                <th scope="col" className="text-right">Price</th>
                <th scope="col" className="text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {services.map((service) => (
                <tr key={service.id} className={service.is_active === 0 ? "opacity-50" : undefined}>
                  <td className="font-medium text-ink-900">
                    {service.name}
                    {service.is_active === 0 ? <span className="badge-neutral ml-2">inactive</span> : null}
                  </td>
                  <td className="text-ink-500">{service.category ?? "—"}</td>
                  <td className="tabular text-right text-ink-600">{service.duration_minutes} min</td>
                  <td className="tabular text-right font-medium">{formatPkr(service.price_pkr)}</td>
                  <td className="text-right whitespace-nowrap">
                    <Button onClick={() => setEditing(service)} variant="ghost" size="sm">
                      Edit
                    </Button>
                    {service.is_active === 1 ? (
                      <Button onClick={() => setDeactivating(service)} variant="ghost" size="sm">
                        Deactivate
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating || editing ? (
        <ServiceModal
          // Keyed on the row so switching straight from one service to another
          // remounts the form instead of leaving the previous values in it.
          key={editing?.id ?? "new"}
          service={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            reloadAll();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={deactivating !== null}
        onClose={() => setDeactivating(null)}
        onConfirm={async () => {
          if (!deactivating) return;
          const result = await deactivate.run(deactivating.id);
          if (!result) {
            toast.error(deactivate.error ?? "Could not deactivate");
            return;
          }
          toast.success(`${deactivating.name} deactivated`);
          setDeactivating(null);
          reloadAll();
        }}
        title={`Deactivate ${deactivating?.name ?? "this service"}?`}
        body="It disappears from checkout but stays on the visits it has already been billed on, so your past reports do not change."
        confirmLabel="Deactivate"
        busy={deactivate.busy}
      />
    </>
  );
}

function ServiceModal({
  service,
  onClose,
  onSaved
}: {
  service: Service | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState(() => ({
    name: service?.name ?? "",
    category: service?.category ?? "",
    durationMinutes: service?.duration_minutes ?? 45,
    pricePkr: service?.price_pkr ?? 1500
  }));

  const save = useMutation(async () => {
    const body = {
      name: form.name,
      category: form.category || undefined,
      durationMinutes: form.durationMinutes,
      pricePkr: form.pricePkr
    };
    return service
      ? api.patch<{ service: Service }>(`/api/catalog/services/${service.id}`, body)
      : api.post<{ service: Service }>("/api/catalog/services", body);
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={service ? `Edit ${service.name}` : "Add a service"}
      size="sm"
      footer={
        <>
          <Button onClick={onClose} variant="ghost">
            Cancel
          </Button>
          <Button
            onClick={async () => {
              const result = await save.run();
              if (!result) return;
              toast.success(service ? "Service updated" : "Service added");
              onSaved();
            }}
            variant="primary"
            busy={save.busy}
            disabled={!form.name.trim()}
          >
            {service ? "Save changes" : "Add service"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {save.error ? <p className="error-text">{save.error}</p> : null}
        <TextInput
          label="Name"
          value={form.name}
          onChange={(name) => setForm({ ...form, name })}
          error={save.fields.name}
          autoFocus
          required
        />
        <TextInput
          label="Category"
          hint="Optional — groups the buttons on the checkout screen, e.g. Hair, Skin, Bridal."
          value={form.category}
          onChange={(category) => setForm({ ...form, category })}
          error={save.fields.category}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberInput
            label="Price"
            prefix="Rs."
            value={form.pricePkr}
            onChange={(pricePkr) => setForm({ ...form, pricePkr })}
            min={0}
            error={save.fields.pricePkr}
            required
          />
          <NumberInput
            label="Time"
            hint="Minutes"
            value={form.durationMinutes}
            onChange={(durationMinutes) => setForm({ ...form, durationMinutes })}
            min={5}
            max={600}
            step={5}
            error={save.fields.durationMinutes}
          />
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

function StaffTab() {
  const toast = useToast();
  const { refresh } = useApp();
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [creating, setCreating] = useState(false);
  const [deactivating, setDeactivating] = useState<Staff | null>(null);

  const list = useAsync(
    (signal) => api.get<{ staff: Staff[] }>("/api/catalog/staff", { includeInactive: showInactive }, signal),
    [showInactive]
  );
  const locations = useAsync((signal) => api.get<{ locations: Location[] }>("/api/catalog/locations", undefined, signal), []);
  const deactivate = useMutation(async (id: string) => api.delete<{ ok: true }>(`/api/catalog/staff/${id}`));

  const members = list.data?.staff ?? [];
  const locationList = locations.data?.locations ?? [];
  const locationName = (id: string | null) => locationList.find((entry) => entry.id === id)?.name ?? "—";

  const reloadAll = () => {
    list.reload();
    refresh();
  };

  return (
    <>
      <Toolbar
        count={members.length}
        noun="team member"
        showInactive={showInactive}
        onToggleInactive={setShowInactive}
        onAdd={() => setCreating(true)}
        addLabel="Add a team member"
      />

      {list.loading && members.length === 0 ? (
        <LoadingBlock rows={4} />
      ) : members.length === 0 ? (
        <EmptyState
          title="No team members yet"
          body="Adding your stylists lets each bill record who did the work, which is what makes the staff performance report useful."
          action={
            <Button onClick={() => setCreating(true)} variant="primary">
              Add a team member
            </Button>
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Role</th>
                <th scope="col">Mobile</th>
                {locationList.length > 1 ? <th scope="col">Branch</th> : null}
                <th scope="col" className="text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id} className={member.is_active === 0 ? "opacity-50" : undefined}>
                  <td className="font-medium text-ink-900">
                    {member.name}
                    {member.is_active === 0 ? <span className="badge-neutral ml-2">inactive</span> : null}
                  </td>
                  <td className="text-ink-500">{member.role ?? "—"}</td>
                  <td className="tabular text-ink-600">{member.phone ? formatPhone(member.phone) : "—"}</td>
                  {locationList.length > 1 ? (
                    <td className="text-ink-500">{locationName(member.location_id)}</td>
                  ) : null}
                  <td className="text-right whitespace-nowrap">
                    <Button onClick={() => setEditing(member)} variant="ghost" size="sm">
                      Edit
                    </Button>
                    {member.is_active === 1 ? (
                      <Button onClick={() => setDeactivating(member)} variant="ghost" size="sm">
                        Deactivate
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating || editing ? (
        <StaffModal
          key={editing?.id ?? "new"}
          member={editing}
          locations={locationList}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            reloadAll();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={deactivating !== null}
        onClose={() => setDeactivating(null)}
        onConfirm={async () => {
          if (!deactivating) return;
          const result = await deactivate.run(deactivating.id);
          if (!result) {
            toast.error(deactivate.error ?? "Could not deactivate");
            return;
          }
          toast.success(`${deactivating.name} deactivated`);
          setDeactivating(null);
          reloadAll();
        }}
        title={`Deactivate ${deactivating?.name ?? "this person"}?`}
        body="They stop appearing on new bills. Their past work stays attributed to them in your reports."
        confirmLabel="Deactivate"
        busy={deactivate.busy}
      />
    </>
  );
}

function StaffModal({
  member,
  locations,
  onClose,
  onSaved
}: {
  member: Staff | null;
  locations: Location[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState(() => ({
    name: member?.name ?? "",
    role: member?.role ?? "",
    phone: member?.phone ?? "",
    locationId: member?.location_id ?? ""
  }));

  const save = useMutation(async () => {
    const body = {
      name: form.name,
      role: form.role || undefined,
      phone: form.phone || undefined,
      locationId: form.locationId || undefined
    };
    return member
      ? api.patch<{ staff: Staff }>(`/api/catalog/staff/${member.id}`, body)
      : api.post<{ staff: Staff }>("/api/catalog/staff", body);
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={member ? `Edit ${member.name}` : "Add a team member"}
      size="sm"
      footer={
        <>
          <Button onClick={onClose} variant="ghost">
            Cancel
          </Button>
          <Button
            onClick={async () => {
              const result = await save.run();
              if (!result) return;
              toast.success(member ? "Saved" : "Team member added");
              onSaved();
            }}
            variant="primary"
            busy={save.busy}
            disabled={!form.name.trim()}
          >
            {member ? "Save changes" : "Add"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {save.error ? <p className="error-text">{save.error}</p> : null}
        <TextInput
          label="Name"
          value={form.name}
          onChange={(name) => setForm({ ...form, name })}
          error={save.fields.name}
          autoFocus
          required
        />
        <TextInput
          label="Role"
          hint="Optional — Stylist, Beautician, Receptionist."
          value={form.role}
          onChange={(role) => setForm({ ...form, role })}
          error={save.fields.role}
        />
        <TextInput
          label="Mobile"
          hint="Optional"
          inputMode="tel"
          value={form.phone}
          onChange={(phone) => setForm({ ...form, phone })}
          error={save.fields.phone}
        />
        {locations.length > 1 ? (
          <Select
            label="Branch"
            value={form.locationId}
            onChange={(locationId) => setForm({ ...form, locationId })}
            options={[
              { value: "", label: "Any branch" },
              ...locations.map((location) => ({ value: location.id, label: location.name }))
            ]}
            error={save.fields.locationId}
          />
        ) : null}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------

function RewardsTab() {
  const toast = useToast();
  const { data } = useApp();
  const [showInactive, setShowInactive] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deactivating, setDeactivating] = useState<Reward | null>(null);

  const list = useAsync(
    (signal) => api.get<{ rewards: Reward[] }>("/api/catalog/rewards", { includeInactive: showInactive }, signal),
    [showInactive]
  );
  const deactivate = useMutation(async (id: string) => api.delete<{ ok: true }>(`/api/catalog/rewards/${id}`));

  const rewards = list.data?.rewards ?? [];
  const perHundred = data.settings.pointsPerHundredPkr;

  /** What a reward costs in spend, which is the number an owner actually reasons about. */
  const spendFor = (points: number) => (perHundred > 0 ? (points / perHundred) * 100 : 0);

  return (
    <>
      <Toolbar
        count={rewards.length}
        noun="reward"
        showInactive={showInactive}
        onToggleInactive={setShowInactive}
        onAdd={() => setCreating(true)}
        addLabel="Add a reward"
      />

      <CardBody className="border-b border-ink-100 bg-ink-50/60 py-3 text-sm text-ink-600">
        Customers earn <strong className="font-semibold">{formatNumber(perHundred)}</strong>{" "}
        {perHundred === 1 ? "point" : "points"} per Rs. 100 spent. Change that under Settings → Loyalty.
      </CardBody>

      {list.loading && rewards.length === 0 ? (
        <LoadingBlock rows={3} />
      ) : rewards.length === 0 ? (
        <EmptyState
          title="No rewards yet"
          body="One reward is enough to start. Something worth about a tenth of what a customer spends to earn it keeps the maths comfortable."
          action={
            <Button onClick={() => setCreating(true)} variant="primary">
              Add a reward
            </Button>
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Reward</th>
                <th scope="col" className="text-right">Points</th>
                <th scope="col" className="text-right">Roughly the spend</th>
                <th scope="col" className="text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rewards.map((reward) => (
                <tr key={reward.id} className={reward.is_active === 0 ? "opacity-50" : undefined}>
                  <td>
                    <span className="font-medium text-ink-900">{reward.name}</span>
                    {reward.is_active === 0 ? <span className="badge-neutral ml-2">inactive</span> : null}
                    {reward.description ? (
                      <span className="block text-xs text-ink-400">{reward.description}</span>
                    ) : null}
                  </td>
                  <td className="tabular text-right font-medium text-gold-700">
                    {formatNumber(reward.points_required)}
                  </td>
                  <td className="tabular text-right text-ink-500">{formatPkr(spendFor(reward.points_required))}</td>
                  <td className="text-right whitespace-nowrap">
                    {reward.is_active === 1 ? (
                      <Button onClick={() => setDeactivating(reward)} variant="ghost" size="sm">
                        Deactivate
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RewardModal
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={() => {
          setCreating(false);
          list.reload();
        }}
      />

      <ConfirmDialog
        open={deactivating !== null}
        onClose={() => setDeactivating(null)}
        onConfirm={async () => {
          if (!deactivating) return;
          const result = await deactivate.run(deactivating.id);
          if (!result) {
            toast.error(deactivate.error ?? "Could not deactivate");
            return;
          }
          toast.success(`${deactivating.name} deactivated`);
          setDeactivating(null);
          list.reload();
        }}
        title={`Deactivate ${deactivating?.name ?? "this reward"}?`}
        body="Customers stop working towards it. Points already earned stay on their card and rewards already redeemed are unaffected."
        confirmLabel="Deactivate"
        busy={deactivate.busy}
      />
    </>
  );
}

function RewardModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: "", pointsRequired: 500, description: "" });

  const save = useMutation(async () =>
    api.post<{ reward: Reward }>("/api/catalog/rewards", {
      name: form.name,
      pointsRequired: form.pointsRequired,
      description: form.description || undefined
    })
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a reward"
      size="sm"
      footer={
        <>
          <Button onClick={onClose} variant="ghost">
            Cancel
          </Button>
          <Button
            onClick={async () => {
              const result = await save.run();
              if (!result) return;
              toast.success("Reward added");
              setForm({ name: "", pointsRequired: 500, description: "" });
              onSaved();
            }}
            variant="primary"
            busy={save.busy}
            disabled={!form.name.trim()}
          >
            Add reward
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {save.error ? <p className="error-text">{save.error}</p> : null}
        <TextInput
          label="Reward"
          hint="What the customer gets — “Free haircut”, “30% off any facial”."
          value={form.name}
          onChange={(name) => setForm({ ...form, name })}
          error={save.fields.name}
          autoFocus
          required
        />
        <NumberInput
          label="Points needed"
          value={form.pointsRequired}
          onChange={(pointsRequired) => setForm({ ...form, pointsRequired })}
          min={1}
          step={50}
          error={save.fields.pointsRequired}
          required
        />
        <TextInput
          label="Small print"
          hint="Optional — “Weekdays only”, “Not with other offers”."
          value={form.description}
          onChange={(description) => setForm({ ...form, description })}
          error={save.fields.description}
        />
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

function Toolbar({
  count,
  noun,
  showInactive,
  onToggleInactive,
  onAdd,
  addLabel
}: {
  count: number;
  noun: string;
  showInactive: boolean;
  onToggleInactive: (value: boolean) => void;
  onAdd: () => void;
  addLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-5 py-3.5 sm:px-6">
      <p className="text-sm text-ink-500">
        {formatNumber(count)} {count === 1 ? noun : `${noun}s`}
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <Checkbox label="Show inactive" checked={showInactive} onChange={onToggleInactive} />
        <Button onClick={onAdd} variant="primary" size="sm">
          {addLabel}
        </Button>
      </div>
    </div>
  );
}
