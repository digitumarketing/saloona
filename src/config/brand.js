export const brand = {
  productName: "Saloona",
  companyName: "Digitum",
  legalName: "Digitum Technologies",
  country: "Pakistan",
  currency: "PKR",
  supportEmail: "hello@digitum.pk",
  salesPhone: "+92 300 0000000",
  baseUrl: "https://saloona.example.com",
  tagline: "Bring recurring customers back before they disappear.",
  description:
    "A Pakistan-first SaaS for salons and recurring-service businesses to manage customers, visits, appointments, loyalty, WhatsApp follow-ups, and payments.",
  colors: {
    ink: "#14213d",
    teal: "#0f766e",
    gold: "#f59e0b",
    mist: "#f6f8fb",
    paper: "#ffffff"
  },
  social: {
    twitter: "@digitum",
    linkedin: "https://www.linkedin.com/company/digitum"
  }
};

export const pricingPlans = [
  {
    id: "starter",
    name: "Starter",
    price: 3999,
    summary: "For one branch getting serious about repeat customers.",
    limits: "1 location, 5 staff, 2,000 customers",
    features: ["Customer CRM", "Visits and appointments", "QR customer PWA", "Manual payments", "Basic at-risk analytics"]
  },
  {
    id: "growth",
    name: "Growth",
    price: 7999,
    summary: "For busy salons and service teams with structured follow-ups.",
    limits: "3 locations, 20 staff, 10,000 customers",
    features: ["Everything in Starter", "Loyalty and rewards", "WhatsApp message queue", "Recovered customer reports", "CSV exports"]
  },
  {
    id: "scale",
    name: "Scale",
    price: 14999,
    summary: "For multi-branch operators that need controls and integrations.",
    limits: "10 locations, 75 staff, 50,000 customers",
    features: ["Everything in Growth", "Provider adapters", "Webhook stubs", "Advanced analytics", "Priority onboarding"]
  }
];
