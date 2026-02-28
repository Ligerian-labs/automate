export type DocsSlug =
  | "getting-started"
  | "pipeline-format"
  | "api-reference"
  | "models-pricing"
  | "architecture";

export interface DocsSectionMeta {
  id: string;
  label: string;
  excerpt: string;
}

export interface DocsPageMeta {
  slug: DocsSlug;
  title: string;
  route: `/docs/${string}`;
  description: string;
  sidebarLabel: string;
  sections: DocsSectionMeta[];
}

export const DOCS_PAGES: DocsPageMeta[] = [
  {
    slug: "getting-started",
    title: "Getting Started",
    route: "/docs/getting-started",
    description:
      "Create your first AI pipeline in under 5 minutes with setup, run, and results guidance.",
    sidebarLabel: "GETTING STARTED",
    sections: [
      {
        id: "overview",
        label: "Introduction",
        excerpt:
          "Overview of account setup, pipeline creation, and first execution.",
      },
      {
        id: "prerequisites",
        label: "Prerequisites",
        excerpt: "What you need before creating a pipeline.",
      },
      {
        id: "create-account",
        label: "Create an account",
        excerpt: "Sign up and receive starter credits.",
      },
      {
        id: "first-pipeline",
        label: "Your first pipeline",
        excerpt: "Minimal YAML example and first definition.",
      },
      {
        id: "run",
        label: "Run the pipeline",
        excerpt: "Trigger manually, by API, or on a schedule.",
      },
      {
        id: "results",
        label: "View results",
        excerpt: "Inspect outputs, token usage, and cost details.",
      },
      {
        id: "next-steps",
        label: "Next steps",
        excerpt: "Continue with schema, API, and pricing references.",
      },
    ],
  },
  {
    slug: "pipeline-format",
    title: "Pipeline Format",
    route: "/docs/pipeline-format",
    description:
      "YAML and JSON schema reference including step types, variables, and output delivery.",
    sidebarLabel: "PIPELINE FORMAT",
    sections: [
      {
        id: "overview",
        label: "Overview",
        excerpt: "Core structure of a pipeline definition.",
      },
      {
        id: "pipeline-definition",
        label: "Pipeline definition",
        excerpt: "Top-level fields and validation expectations.",
      },
      {
        id: "step-types",
        label: "Step types",
        excerpt: "Supported execution step types and purpose.",
      },
      {
        id: "variables",
        label: "Variable interpolation",
        excerpt: "Reference input, vars, outputs, and secrets.",
      },
      {
        id: "output-delivery",
        label: "Output delivery",
        excerpt: "Delivery targets for final pipeline output.",
      },
    ],
  },
  {
    slug: "api-reference",
    title: "API Reference",
    route: "/docs/api-reference",
    description:
      "REST endpoints for auth, pipelines, runs, schedules, user resources, and integrations.",
    sidebarLabel: "API REFERENCE",
    sections: [
      {
        id: "overview",
        label: "Overview",
        excerpt: "Base URL and API usage conventions.",
      },
      {
        id: "authentication",
        label: "Authentication",
        excerpt: "JWT and API key auth methods.",
      },
      {
        id: "pipelines",
        label: "Pipelines",
        excerpt: "CRUD endpoints for pipeline definitions.",
      },
      {
        id: "execution",
        label: "Execution",
        excerpt: "Run trigger, status, stream, and cancellation.",
      },
      {
        id: "schedules",
        label: "Schedules",
        excerpt: "Scheduling and upcoming run endpoints.",
      },
      {
        id: "user-secrets",
        label: "User & Secrets",
        excerpt: "Profile, usage, API keys, and encrypted secrets.",
      },
      {
        id: "models",
        label: "Models",
        excerpt: "Model catalog and compatibility endpoint.",
      },
      {
        id: "webhooks",
        label: "Webhooks",
        excerpt: "Outbound delivery and inbound trigger patterns.",
      },
    ],
  },
  {
    slug: "models-pricing",
    title: "Models & Pricing",
    route: "/docs/models-pricing",
    description:
      "Supported models, pricing details, and credit-based cost estimation.",
    sidebarLabel: "MODELS & PRICING",
    sections: [
      {
        id: "overview",
        label: "Overview",
        excerpt: "How model selection and billing works.",
      },
      {
        id: "available-models",
        label: "Available models",
        excerpt: "Provider and model options.",
      },
      {
        id: "credit-system",
        label: "Credit system",
        excerpt: "Token-to-credit conversion and markup.",
      },
      {
        id: "cost-estimation",
        label: "Cost estimation",
        excerpt: "How run cost is estimated before execution.",
      },
    ],
  },
  {
    slug: "architecture",
    title: "Architecture",
    route: "/docs/architecture",
    description:
      "System architecture, worker execution flow, and key infrastructure choices.",
    sidebarLabel: "ARCHITECTURE",
    sections: [
      {
        id: "overview",
        label: "Overview",
        excerpt: "High-level architecture summary.",
      },
      {
        id: "system-components",
        label: "System components",
        excerpt: "Core platform layers and responsibilities.",
      },
      {
        id: "worker-flow",
        label: "Worker flow",
        excerpt: "Step-by-step run execution flow.",
      },
      {
        id: "technology-choices",
        label: "Technology choices",
        excerpt: "Rationale behind stack selections.",
      },
    ],
  },
];

export interface DocsSearchEntry {
  title: string;
  excerpt: string;
  href: string;
  keywords: string[];
}

export function getDocsPageByRoute(route: string): DocsPageMeta | undefined {
  return DOCS_PAGES.find((page) => page.route === route);
}

export function getDocsSearchEntries(): DocsSearchEntry[] {
  return DOCS_PAGES.flatMap((page) => {
    const pageEntry: DocsSearchEntry = {
      title: page.title,
      excerpt: page.description,
      href: page.route,
      keywords: [page.title, page.slug],
    };

    const sectionEntries = page.sections.map((section) => ({
      title: `${page.title}: ${section.label}`,
      excerpt: section.excerpt,
      href: `${page.route}#${section.id}`,
      keywords: [page.title, section.label, page.slug],
    }));

    return [pageEntry, ...sectionEntries];
  });
}
