import worker from "../src/worker.js";

const env = { BASE_URL: "https://example.com" };
const cases = [
  ["https://example.com/", "text/html"],
  ["https://example.com/pricing", "text/html"],
  ["https://example.com/industries/salons", "text/html"],
  ["https://example.com/app", "text/html"],
  ["https://example.com/customer/demo", "text/html"],
  ["https://example.com/sitemap.xml", "application/xml"],
  ["https://example.com/robots.txt", "text/plain"],
  ["https://example.com/manifest.webmanifest", "application/json"]
];

for (const [url, contentType] of cases) {
  const response = await worker.fetch(new Request(url), env);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  const actual = response.headers.get("content-type") || "";
  if (!actual.includes(contentType)) throw new Error(`${url} returned ${actual}, expected ${contentType}`);
  const body = await response.text();
  if (!body.length) throw new Error(`${url} returned an empty body`);
}

console.log(`Smoke tested ${cases.length} public routes.`);
