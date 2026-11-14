import type { DayKey, Domain, RotationSlot, SkillTier } from '../types/learning';

export const DOMAINS: Domain[] = ['Angular', 'FastAPI', 'DevOps', 'AWS', 'GCP'];

export const DAY_ORDER: DayKey[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const DEFAULT_ROTATION_MAP: Record<DayKey, RotationSlot> = {
  Mon: 'Angular',
  Tue: 'FastAPI',
  Wed: 'DevOps',
  Thu: 'AWS',
  Fri: 'GCP',
  Sat: 'Multi-Cloud Synthesis',
  Sun: 'Review & Gap Audit',
};

export interface SeedSkillTemplate {
  domain: Domain;
  title: string;
  tier: SkillTier;
  description: string;
  studyBrief: string;
  labPrompt: string;
}

export const SEED_SKILLS: SeedSkillTemplate[] = [
  // Angular
  {
    domain: 'Angular',
    title: 'Signals & Zone-less Change Detection',
    tier: 'Top 1%',
    description: 'Fine-grained reactivity with signal(), computed(), effect(), and removing zone.js overhead.',
    studyBrief:
      'Top 1% Angular engineers eliminate unnecessary subtree checks by modeling state with Signals and OnPush/Zone-less change detection. Understand glitch-free topological graph updates, why effect() should remain side-effect-only without mutating tracked signals directly, and how to profile INP and change-detection cycles in Angular DevTools.',
    labPrompt:
      'Refactor a multi-widget dashboard component from RxJS BehaviorSubjects + Zone.js to signal-based state with computed selectors and Measure INP before/after.',
  },
  {
    domain: 'Angular',
    title: 'SSR, Event Replay & Incremental Hydration',
    tier: 'Top 1%',
    description: 'Eliminating hydration waterfalls, TransferState caching, and @defer block hydration triggers.',
    studyBrief:
      'Large Angular apps fail Core Web Vitals when client hydration blocks interactivity or re-fetches SSR API data. Master TransferState deduplication, non-destructive DOM hydration, event replay queues, and @defer (on viewport / interaction) boundaries.',
    labPrompt:
      'Configure SSR with TransferState and split a heavy analytics table behind @defer(on viewport) while verifying zero duplicate HTTP calls.',
  },
  {
    domain: 'Angular',
    title: 'RxJS Flattening & Backpressure Patterns',
    tier: 'Senior',
    description: 'Preventing race conditions with switchMap, exhaustMap, concatMap, and shareReplay refCount.',
    studyBrief:
      'Choose flattening operators intentionally: switchMap for idempotent reads/typeahead, exhaustMap for auth/payment submits to prevent double-POSTs, concatMap for ordered mutations, and mergeMap with explicit concurrency caps.',
    labPrompt:
      'Build an optimistic search + mutation queue using switchMap and concatMap with automatic cancellation and error isolation via catchError inside inner pipes.',
  },
  {
    domain: 'Angular',
    title: 'Standalone Architecture & Typed Reactive Forms',
    tier: 'Foundational',
    description: 'Lazy-loaded feature routes, functional route guards, and strict NonNullableFormBuilder.',
    studyBrief:
      'Enforce strict module boundaries via standalone components, functional inject() DI, and environment-level HTTP interceptors for bearer auth and retry backoff.',
    labPrompt:
      'Create a multi-step typed form with custom async validator and route-level functional guard.',
  },
  // FastAPI
  {
    domain: 'FastAPI',
    title: 'Asyncio Event Loop & Connection Pool Tuning',
    tier: 'Top 1%',
    description: 'Avoiding event-loop starvation, SQLAlchemy async pool sizing, and Uvicorn/Gunicorn worker math.',
    studyBrief:
      'A single blocking CPU or sync I/O call inside an async def endpoint freezes the entire event loop worker. Master run_in_executor vs sync def threadpool dispatch, SQLAlchemy AsyncEngine pool_size/max_overflow alignment with Postgres max_connections, and graceful shutdown draining.',
    labPrompt:
      'Benchmark a FastAPI service under 500 concurrent requests with Locust, detect an injected blocking call via py-spy, and tune pool_timeout + worker count.',
  },
  {
    domain: 'FastAPI',
    title: 'Pydantic v2 Validation Internals & Serialization',
    tier: 'Senior',
    description: 'Zero-overhead TypeAdapter, custom validators, discriminated unions, and ORJSON responses.',
    studyBrief:
      'Pydantic v2 executes validation in Rust (pydantic-core). Maximize throughput using model_validate_json, discriminated unions for polymorphic webhook payloads, and strict response models that prevent accidental PII leakage.',
    labPrompt:
      'Implement a polymorphic cloud-event ingestion endpoint using Pydantic v2 discriminated unions and custom validator error formatting.',
  },
  {
    domain: 'FastAPI',
    title: 'Dependency Injection Lifecycles & Auth Boundaries',
    tier: 'Senior',
    description: 'Yield dependencies, request-scoped DB sessions, JWT/OIDC verification, and rate limiting.',
    studyBrief:
      'Design clean hexagonal service layers with Depends() overrides for deterministic pytest integration suites, and ensure yield dependencies handle rollback/close on exception.',
    labPrompt:
      'Write an async dependency chain verifying OIDC tokens, tenant isolation context, and automatic DB transaction rollback on error.',
  },
  {
    domain: 'FastAPI',
    title: 'OpenTelemetry Tracing & Structured Observability',
    tier: 'Top 1%',
    description: 'Distributed trace propagation across FastAPI, Redis/PubSub workers, and cloud databases.',
    studyBrief:
      'Correlate every HTTP request with W3C traceparent headers, structured JSON logs containing trace_id/span_id, and tail-based sampling so p99 latency spikes expose exact slow queries.',
    labPrompt:
      'Instrument FastAPI + SQLAlchemy with OpenTelemetry OTLP exporter and inspect end-to-end spans across an async background task.',
  },
  // DevOps
  {
    domain: 'DevOps',
    title: 'Kubernetes Scheduler, QoS & Pod Disruption Budgets',
    tier: 'Top 1%',
    description: 'Preventing cascading OOMKills, Guaranteed vs Burstable QoS, and zero-downtime node drains.',
    studyBrief:
      'Top 1% platform engineers design workloads that survive cluster autoscaling and spot interruptions. Master cgroups v2 memory limits vs requests, PodDisruptionBudgets, topologySpreadConstraints, and graceful preStop hooks.',
    labPrompt:
      'Simulate a rolling node drain under live load and tune PDB + readinessProbe + preStop sleep to achieve 0 failed HTTP requests.',
  },
  {
    domain: 'DevOps',
    title: 'Terraform State Architecture & Drift Governance',
    tier: 'Senior',
    description: 'Remote state locking, layered state blast-radius isolation, and policy-as-code (OPA/Checkov).',
    studyBrief:
      'Avoid monolithic Terraform states that create organization-wide lock contention. Split state by blast radius (org/network/cluster/app), enforce remote state locking, and gate PRs with OPA policies.',
    labPrompt:
      'Refactor a single-state multi-cloud stack into layered remote states with explicit state outputs and an OPA policy check denying public S3/GCS buckets.',
  },
  {
    domain: 'DevOps',
    title: 'GitOps Progressive Delivery & Supply Chain Security',
    tier: 'Top 1%',
    description: 'ArgoCD canary rollouts, SLSA provenance, Cosign image signing, and SBOM attestation.',
    studyBrief:
      'Secure the artifact pipeline end-to-end: keyless OIDC CI builds, minimal distroless containers, Cosign signature verification via admission controllers, and automated Argo Rollouts canary abort on error-budget burn.',
    labPrompt:
      'Build a GitHub Actions workflow producing a signed distroless container and an Argo Rollout manifest that rolls back if 5xx rate exceeds 1%.',
  },
  {
    domain: 'DevOps',
    title: 'SLO Error Budgets & Multi-Burn-Rate Alerting',
    tier: 'Foundational',
    description: 'Defining meaningful SLIs, burn-rate alerts, and blameless post-mortem rigor.',
    studyBrief:
      'Replace noisy CPU alerts with symptom-based availability/latency SLIs and multi-window burn-rate alerts (2% budget burn in 1h, 5% in 6h) tied directly to deployment freeze decisions.',
    labPrompt:
      'Author a Prometheus/PromQL SLO alert rule for 99.9% availability with fast and slow burn-rate windows.',
  },
  // AWS
  {
    domain: 'AWS',
    title: 'Multi-Account Organizations & IAM Policy Boundaries',
    tier: 'Top 1%',
    description: 'SCP guardrails, IAM permission boundaries, OIDC federation, and cross-account least privilege.',
    studyBrief:
      'Understand the full IAM evaluation chain: explicit deny -> SCP -> resource policy -> permission boundary -> session policy -> identity policy. Eliminate long-lived IAM user keys via OIDC federation and short-lived STS roles.',
    labPrompt:
      'Author an AWS SCP blocking unencrypted EBS/S3 creation and an IAM permission boundary preventing privilege escalation by workload roles.',
  },
  {
    domain: 'AWS',
    title: 'VPC Transit Gateway, PrivateLink & DNS Resolution',
    tier: 'Top 1%',
    description: 'Zero-internet-egress architectures, Route53 Resolver inbound/outbound, and overlapping CIDR defense.',
    studyBrief:
      'Architect hub-and-spoke VPCs with Transit Gateway route tables, Interface VPC Endpoints (PrivateLink) to keep S3/Secrets/STS traffic off the public internet, and split-horizon Route53 Private Hosted Zones.',
    labPrompt:
      'Design a private EKS-to-RDS + SecretsManager topology with zero NAT Gateway traffic for AWS API calls.',
  },
  {
    domain: 'AWS',
    title: 'EKS Control Plane, IRSA / Pod Identity & Karpenter',
    tier: 'Senior',
    description: 'EKS Pod Identity vs IRSA, VPC CNI prefix delegation, and Karpenter bin-packing.',
    studyBrief:
      'Avoid IP exhaustion in EKS subnets by enabling VPC CNI prefix mode, migrate from legacy kube2iam/IRSA boilerplate to EKS Pod Identity, and replace static node groups with Karpenter consolidation.',
    labPrompt:
      'Configure EKS Pod Identity for a FastAPI workload accessing DynamoDB and tune Karpenter NodePool consolidation policies.',
  },
  {
    domain: 'AWS',
    title: 'DynamoDB Single-Table Design & FinOps',
    tier: 'Foundational',
    description: 'Partition key cardinality, GSIs, hot-key avoidance, and AWS Cost Explorer optimization.',
    studyBrief:
      'Model access patterns first before choosing PK/SK composite keys; spot hot partitions with CloudWatch Contributor Insights and optimize compute spend via Savings Plans + Graviton.',
    labPrompt:
      'Design a DynamoDB single-table key schema supporting 4 access patterns without Scan operations.',
  },
  // GCP
  {
    domain: 'GCP',
    title: 'VPC Service Controls & Shared VPC Architecture',
    tier: 'Top 1%',
    description: 'Preventing data exfiltration across GCP projects with service perimeters and ingress/egress rules.',
    studyBrief:
      'IAM alone cannot stop an attacker with stolen credentials from copying BigQuery/GCS data to an external GCP project. VPC Service Controls create a cryptographic/network perimeter around Google-managed APIs.',
    labPrompt:
      'Define a Shared VPC host-service layout and a dry-run VPC Service Controls perimeter protecting Cloud Storage and BigQuery.',
  },
  {
    domain: 'GCP',
    title: 'Workload Identity Federation & IAM Hierarchy',
    tier: 'Top 1%',
    description: 'Keyless cross-cloud AWS/GitHub-to-GCP auth via STS exchange and Organization Policy constraints.',
    studyBrief:
      'Never export JSON service account keys. Use Workload Identity Federation so AWS IAM roles or GitHub Actions exchange native OIDC/AWS tokens for short-lived GCP impersonation tokens.',
    labPrompt:
      'Configure GCP Workload Identity Federation trusting an AWS IAM role to read a GCS bucket with zero static keys.',
  },
  {
    domain: 'GCP',
    title: 'GKE Autopilot, Gateway API & Cloud Armor',
    tier: 'Senior',
    description: 'Multi-cluster ingress, L7 WAF policies, Private GKE nodes, and Cloud NAT egress.',
    studyBrief:
      'Leverage GKE Gateway API for cross-namespace traffic splitting and mTLS, front public Angular/FastAPI endpoints with Global External Application Load Balancer + Cloud Armor WAF rules.',
    labPrompt:
      'Deploy a multi-service GKE Gateway route with Cloud Armor rate-limiting and Private Google Access.',
  },
  {
    domain: 'GCP',
    title: 'Cloud Run, Pub/Sub & Eventarc Event-Driven Scale',
    tier: 'Foundational',
    description: 'Concurrency tuning, dead-letter topics, idempotent consumers, and cold-start mitigation.',
    studyBrief:
      'Tune Cloud Run max-concurrency vs CPU allocation for FastAPI async workers, and protect Pub/Sub push consumers with dead-letter topics and idempotency keys.',
    labPrompt:
      'Wire a Pub/Sub push subscription to a Cloud Run FastAPI service with exponential retry and dead-letter routing.',
  },
];

export interface SeedReviewCardTemplate {
  domain: Domain;
  skillTitle: string;
  prompt: string;
  answer: string;
  explanation: string;
}

export const SEED_REVIEW_CARDS: SeedReviewCardTemplate[] = [
  {
    domain: 'Angular',
    skillTitle: 'Signals & Zone-less Change Detection',
    prompt: 'Why does Angular throw NG0600 by default when you write to another signal inside an effect()?',
    answer: 'Writing to tracked signals inside effect() risks infinite reactive cycles and inconsistent mid-propagation state.',
    explanation:
      'Effects are intended for side effects (DOM/logging/analytics), not derived state. Derived values belong in computed(). If an effect genuinely must synchronize state, use untracked() or explicit design separation rather than bypassing NG0600.',
  },
  {
    domain: 'Angular',
    skillTitle: 'RxJS Flattening & Backpressure Patterns',
    prompt: 'Which RxJS flattening operator should wrap a form Submit HTTP POST button stream to prevent duplicate charges on double-click, and why?',
    answer: 'exhaustMap — it ignores new trigger emissions while the active inner observable is still in flight.',
    explanation:
      'switchMap would abort the in-flight POST (dangerous for non-idempotent writes), mergeMap would fire duplicate concurrent POSTs, and concatMap would queue a second duplicate charge after the first finishes.',
  },
  {
    domain: 'FastAPI',
    skillTitle: 'Asyncio Event Loop & Connection Pool Tuning',
    prompt: 'In FastAPI, what happens differently when you declare a blocking CPU/DB endpoint as `async def` versus plain `def`?',
    answer: '`async def` runs directly on the main asyncio event loop (freezing all concurrent requests), whereas plain `def` is dispatched to AnyIO’s worker threadpool.',
    explanation:
      'Never call synchronous libraries (`requests`, `psycopg2`, heavy CPU loops) inside `async def`. Either use native async drivers (`httpx`, `asyncpg`) or offload blocking work via `def` / `anyio.to_thread.run_sync`.',
  },
  {
    domain: 'FastAPI',
    skillTitle: 'Pydantic v2 Validation Internals & Serialization',
    prompt: 'Why should FastAPI endpoints always declare an explicit `response_model` distinct from the ORM/DB model?',
    answer: 'It enforces an output allowlist that strips sensitive fields (like hashed_password or internal flags) and validates API contract stability.',
    explanation:
      'Returning raw ORM objects risks accidental schema drift and PII exposure if columns are later added to the database table.',
  },
  {
    domain: 'DevOps',
    skillTitle: 'Kubernetes Scheduler, QoS & Pod Disruption Budgets',
    prompt: 'Under node memory pressure, in what order does the kubelet evict Kubernetes pods across Guaranteed, Burstable, and BestEffort QoS classes?',
    answer: 'BestEffort is evicted first, then Burstable exceeding requests, and Guaranteed last (only if exceeding node allocatable/system thresholds).',
    explanation:
      'A Pod gets Guaranteed QoS only when every container sets identical CPU/memory `requests` and `limits`. Critical stateful or gateway pods should be Guaranteed with an appropriate PriorityClass.',
  },
  {
    domain: 'DevOps',
    skillTitle: 'Terraform State Architecture & Drift Governance',
    prompt: 'Why is storing networking, RDS, and application Kubernetes manifests in a single Terraform root state an anti-pattern at scale?',
    answer: 'It creates a massive blast radius, slow plan/apply locks across teams, and prevents independent RBAC boundaries.',
    explanation:
      'Layer state by change frequency and ownership (Org/IAM -> VPC Networking -> Data/Clusters -> App Releases) connected via remote state or SSM/Output lookups.',
  },
  {
    domain: 'AWS',
    skillTitle: 'Multi-Account Organizations & IAM Policy Boundaries',
    prompt: 'If an AWS IAM Role has `AdministratorAccess` attached, but also has a Permission Boundary limiting it to S3 read-only, what can the role actually do?',
    answer: 'Only S3 read-only actions—effective permissions are the intersection of identity policy and permission boundary (minus any explicit denies or SCP restrictions).',
    explanation:
      'Permission boundaries define the maximum ceiling of permissions an entity can hold, making them essential when delegating role creation to developers or CI pipelines.',
  },
  {
    domain: 'AWS',
    skillTitle: 'VPC Transit Gateway, PrivateLink & DNS Resolution',
    prompt: 'What is the key cost and security difference between a Gateway VPC Endpoint (S3/DynamoDB) and an Interface VPC Endpoint (PrivateLink)?',
    answer: 'Gateway Endpoints are free route-table entries exclusively for S3 and DynamoDB, whereas Interface Endpoints create ENIs with hourly/GB charges for most other AWS services.',
    explanation:
      'Pairing Gateway Endpoints for S3/DynamoDB with Interface Endpoints for Secrets Manager/ECR/STS keeps traffic off NAT Gateways and the public internet.',
  },
  {
    domain: 'GCP',
    skillTitle: 'VPC Service Controls & Shared VPC Architecture',
    prompt: 'How do GCP VPC Service Controls protect against a compromised IAM credential trying to copy GCS objects to an attacker’s external GCP project?',
    answer: 'VPC Service Controls enforce a project/network service perimeter at the Google API layer, blocking API data movement across the perimeter regardless of valid IAM permissions.',
    explanation:
      'IAM answers "who has permission on a resource", while VPC-SC answers "from which authorized network/context can sensitive Google APIs be crossed".',
  },
  {
    domain: 'GCP',
    skillTitle: 'Workload Identity Federation & IAM Hierarchy',
    prompt: 'Why does Workload Identity Federation eliminate the security risk of GCP service account JSON keys when authenticating from AWS or GitHub Actions?',
    answer: 'It exchanges short-lived native OIDC or AWS STS tokens for temporary GCP access tokens with zero static private keys stored in CI or external clouds.',
    explanation:
      'Static JSON keys rarely rotate, leak in logs/repos, and carry indefinite blast radius until revoked.',
  },
];
