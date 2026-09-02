/**
 * @file Skill Catalog Seed Data
 *
 * Generates the initial skill catalog from the canonical SkillTaxonomyEngine
 * plus additional skills required for the "Additional Skills" feature.
 *
 * Categories follow the task specification:
 * A. Cloud & Infrastructure
 * B. Containers / Infrastructure as Code
 * C. CI/CD / GitOps
 * D. Databases / Cache / Search
 * E. Messaging / Event Streaming
 * F. Networking
 * G. Observability / Reliability
 * H. Security / Identity
 * I. Software Architecture
 * J. Development / Testing
 * K. AI-Assisted Development
 * L. Generative AI
 * M. AI Agents
 * N. MCP / AI Interoperability
 * O. AI Evaluation / Quality
 * P. MLOps / AI Platform
 * Q. Developer Experience / Platform Engineering
 * R. Engineering Practices
 */

/**
 * Canonical skill catalog entries for seeding the skill_catalog table.
 * Each entry has: canonicalName, slug, category, subcategory, skillType, description, aliases, sortOrder
 *
 * skillType values: TECHNOLOGY, FRAMEWORK, CONCEPT, PRACTICE, TOOL, ARCHITECTURE
 */
export const SKILL_CATALOG_SEED = [
  // =========================================================================
  // A. CLOUD & INFRASTRUCTURE
  // =========================================================================
  { canonicalName: 'AWS', slug: 'aws', category: 'CLOUD', subcategory: 'Cloud Providers', skillType: 'TECHNOLOGY', description: 'Amazon Web Services cloud computing platform', aliases: ['amazon web services', 'amazon aws', 'aws cloud'], sortOrder: 100 },
  { canonicalName: 'Google Cloud Platform', slug: 'gcp', category: 'CLOUD', subcategory: 'Cloud Providers', skillType: 'TECHNOLOGY', description: 'Google Cloud Platform suite of cloud computing services', aliases: ['google cloud', 'google-cloud', 'google-cloud-platform', 'gcloud'], sortOrder: 101 },
  { canonicalName: 'Microsoft Azure', slug: 'azure', category: 'CLOUD', subcategory: 'Cloud Providers', skillType: 'TECHNOLOGY', description: 'Microsoft cloud computing platform', aliases: ['microsoft azure', 'ms-azure'], sortOrder: 102 },
  { canonicalName: 'Cloudflare', slug: 'cloudflare', category: 'CLOUD', subcategory: 'Cloud Providers', skillType: 'TECHNOLOGY', description: 'Web infrastructure and security company providing CDN and edge computing', aliases: ['cf', 'cloudflare-workers'], sortOrder: 103 },
  { canonicalName: 'DigitalOcean', slug: 'digitalocean', category: 'CLOUD', subcategory: 'Cloud Providers', skillType: 'TECHNOLOGY', description: 'Cloud infrastructure provider for developers', aliases: ['do', 'digital-ocean'], sortOrder: 104 },
  { canonicalName: 'Vercel', slug: 'vercel', category: 'CLOUD', subcategory: 'Cloud Providers', skillType: 'TECHNOLOGY', description: 'Cloud platform for frontend frameworks and static sites', aliases: ['vercel-cloud'], sortOrder: 105 },
  { canonicalName: 'Firebase', slug: 'firebase', category: 'CLOUD', subcategory: 'Cloud Providers', skillType: 'TECHNOLOGY', description: 'Google-backed application development platform', aliases: ['firebase-platform'], sortOrder: 106 },

  // AWS Services
  { canonicalName: 'AWS EC2', slug: 'aws-ec2', category: 'CLOUD', subcategory: 'AWS Services', skillType: 'TECHNOLOGY', description: 'Elastic Compute Cloud virtual servers', aliases: ['ec2', 'amazon-ec2'], sortOrder: 110 },
  { canonicalName: 'AWS S3', slug: 'aws-s3', category: 'CLOUD', subcategory: 'AWS Services', skillType: 'TECHNOLOGY', description: 'Simple Storage Service for object storage', aliases: ['s3', 'amazon-s3'], sortOrder: 111 },
  { canonicalName: 'AWS Lambda', slug: 'aws-lambda', category: 'CLOUD', subcategory: 'AWS Services', skillType: 'TECHNOLOGY', description: 'Serverless compute service', aliases: ['lambda', 'amazon-lambda'], sortOrder: 112 },
  { canonicalName: 'AWS ECS', slug: 'aws-ecs', category: 'CLOUD', subcategory: 'AWS Services', skillType: 'TECHNOLOGY', description: 'Elastic Container Service for running Docker containers', aliases: ['ecs', 'amazon-ecs'], sortOrder: 113 },
  { canonicalName: 'AWS EKS', slug: 'aws-eks', category: 'CLOUD', subcategory: 'AWS Services', skillType: 'TECHNOLOGY', description: 'Elastic Kubernetes Service', aliases: ['eks', 'amazon-eks'], sortOrder: 114 },
  { canonicalName: 'AWS RDS', slug: 'aws-rds', category: 'CLOUD', subcategory: 'AWS Services', skillType: 'TECHNOLOGY', description: 'Relational Database Service', aliases: ['rds', 'amazon-rds'], sortOrder: 115 },
  { canonicalName: 'AWS DynamoDB', slug: 'aws-dynamodb', category: 'CLOUD', subcategory: 'AWS Services', skillType: 'TECHNOLOGY', description: 'Managed NoSQL database service', aliases: ['dynamodb'], sortOrder: 116 },
  { canonicalName: 'AWS CloudFront', slug: 'aws-cloudfront', category: 'CLOUD', subcategory: 'AWS Services', skillType: 'TECHNOLOGY', description: 'Content Delivery Network service', aliases: ['cloudfront'], sortOrder: 117 },
  { canonicalName: 'AWS API Gateway', slug: 'aws-api-gateway', category: 'CLOUD', subcategory: 'AWS Services', skillType: 'TECHNOLOGY', description: 'Managed API Gateway service', aliases: ['api-gateway', 'aws-api-gw'], sortOrder: 118 },
  { canonicalName: 'AWS SQS', slug: 'aws-sqs', category: 'CLOUD', subcategory: 'AWS Services', skillType: 'TECHNOLOGY', description: 'Simple Queue Service', aliases: ['sqs', 'amazon-sqs'], sortOrder: 119 },
  { canonicalName: 'AWS SNS', slug: 'aws-sns', category: 'CLOUD', subcategory: 'AWS Services', skillType: 'TECHNOLOGY', description: 'Simple Notification Service', aliases: ['sns', 'amazon-sns'], sortOrder: 120 },
  { canonicalName: 'AWS EventBridge', slug: 'aws-eventbridge', category: 'CLOUD', subcategory: 'AWS Services', skillType: 'TECHNOLOGY', description: 'Serverless event bus service', aliases: ['eventbridge'], sortOrder: 121 },
  { canonicalName: 'AWS IAM', slug: 'aws-iam', category: 'CLOUD', subcategory: 'AWS Services', skillType: 'TECHNOLOGY', description: 'Identity and Access Management', aliases: ['iam', 'aws-iam'], sortOrder: 122 },
  { canonicalName: 'AWS CloudFormation', slug: 'aws-cloudformation', category: 'CLOUD', subcategory: 'AWS Services', skillType: 'TECHNOLOGY', description: 'Infrastructure as Code service', aliases: ['cloudformation', 'aws-cfn'], sortOrder: 123 },
  { canonicalName: 'AWS CloudWatch', slug: 'aws-cloudwatch', category: 'CLOUD', subcategory: 'AWS Services', skillType: 'TECHNOLOGY', description: 'Monitoring and observability service', aliases: ['cloudwatch'], sortOrder: 124 },
  { canonicalName: 'AWS Cognito', slug: 'aws-cognito', category: 'CLOUD', subcategory: 'AWS Services', skillType: 'TECHNOLOGY', description: 'User authentication and authorization service', aliases: ['cognito'], sortOrder: 125 },

  // GCP Services
  { canonicalName: 'Google Compute Engine', slug: 'gcp-compute-engine', category: 'CLOUD', subcategory: 'GCP Services', skillType: 'TECHNOLOGY', description: 'GCP virtual machine service', aliases: ['compute-engine'], sortOrder: 130 },
  { canonicalName: 'Google Cloud Run', slug: 'gcp-cloud-run', category: 'CLOUD', subcategory: 'GCP Services', skillType: 'TECHNOLOGY', description: 'Fully managed container platform', aliases: ['cloud-run'], sortOrder: 131 },
  { canonicalName: 'Google GKE', slug: 'gcp-gke', category: 'CLOUD', subcategory: 'GCP Services', skillType: 'TECHNOLOGY', description: 'Google Kubernetes Engine', aliases: ['gke', 'google-kubernetes-engine'], sortOrder: 132 },
  { canonicalName: 'Google Cloud Storage', slug: 'gcp-cloud-storage', category: 'CLOUD', subcategory: 'GCP Services', skillType: 'TECHNOLOGY', description: 'Object storage service', aliases: ['cloud-storage', 'gcs'], sortOrder: 133 },
  { canonicalName: 'Google BigQuery', slug: 'gcp-bigquery', category: 'CLOUD', subcategory: 'GCP Services', skillType: 'TECHNOLOGY', description: 'Serverless data warehouse', aliases: ['bigquery'], sortOrder: 134 },

  // Azure Services
  { canonicalName: 'Azure Functions', slug: 'azure-functions', category: 'CLOUD', subcategory: 'Azure Services', skillType: 'TECHNOLOGY', description: 'Serverless compute service', aliases: ['azure-function'], sortOrder: 140 },
  { canonicalName: 'Azure AKS', slug: 'azure-aks', category: 'CLOUD', subcategory: 'Azure Services', skillType: 'TECHNOLOGY', description: 'Azure Kubernetes Service', aliases: ['aks', 'azure-kubernetes'], sortOrder: 141 },
  { canonicalName: 'Azure Blob Storage', slug: 'azure-blob-storage', category: 'CLOUD', subcategory: 'Azure Services', skillType: 'TECHNOLOGY', description: 'Object storage service', aliases: ['blob-storage'], sortOrder: 142 },
  { canonicalName: 'Azure Cosmos DB', slug: 'azure-cosmos-db', category: 'CLOUD', subcategory: 'Azure Services', skillType: 'TECHNOLOGY', description: 'Globally distributed multi-model database', aliases: ['cosmos-db', 'cosmosdb'], sortOrder: 143 },
  { canonicalName: 'Azure DevOps', slug: 'azure-devops', category: 'CLOUD', subcategory: 'Azure Services', skillType: 'TECHNOLOGY', description: 'DevOps toolchain for planning, CI/CD, and repositories', aliases: ['azure-devops-services'], sortOrder: 144 },

  // =========================================================================
  // B. CONTAINERS / INFRASTRUCTURE AS CODE
  // =========================================================================
  { canonicalName: 'Docker', slug: 'docker', category: 'CONTAINERS', subcategory: 'Container Runtimes', skillType: 'TECHNOLOGY', description: 'Container platform for building and deploying applications', aliases: ['docker-engine', 'dockerfile'], sortOrder: 200 },
  { canonicalName: 'Podman', slug: 'podman', category: 'CONTAINERS', subcategory: 'Container Runtimes', skillType: 'TECHNOLOGY', description: 'Daemonless container engine', aliases: ['podman-desktop'], sortOrder: 201 },
  { canonicalName: 'Kubernetes', slug: 'kubernetes', category: 'CONTAINERS', subcategory: 'Container Orchestration', skillType: 'TECHNOLOGY', description: 'Container orchestration platform', aliases: ['k8s', 'kubectl'], sortOrder: 210 },
  { canonicalName: 'Helm', slug: 'helm', category: 'CONTAINERS', subcategory: 'Container Orchestration', skillType: 'TECHNOLOGY', description: 'Package manager for Kubernetes', aliases: ['helm-charts'], sortOrder: 211 },
  { canonicalName: 'Kustomize', slug: 'kustomize', category: 'CONTAINERS', subcategory: 'Container Orchestration', skillType: 'TECHNOLOGY', description: 'Kubernetes native configuration management', aliases: ['kustom'], sortOrder: 212 },
  { canonicalName: 'Terraform', slug: 'terraform', category: 'CONTAINERS', subcategory: 'Infrastructure as Code', skillType: 'TECHNOLOGY', description: 'Infrastructure as Code tool by HashiCorp', aliases: ['tf', 'hcl', 'terraform-cli'], sortOrder: 220 },
  { canonicalName: 'OpenTofu', slug: 'opentofu', category: 'CONTAINERS', subcategory: 'Infrastructure as Code', skillType: 'TECHNOLOGY', description: 'Open-source Terraform fork', aliases: ['tofu'], sortOrder: 221 },
  { canonicalName: 'Pulumi', slug: 'pulumi', category: 'CONTAINERS', subcategory: 'Infrastructure as Code', skillType: 'TECHNOLOGY', description: 'IaC using general-purpose programming languages', aliases: ['pulumi-iac'], sortOrder: 222 },
  { canonicalName: 'Ansible', slug: 'ansible', category: 'CONTAINERS', subcategory: 'Infrastructure as Code', skillType: 'TECHNOLOGY', description: 'IT automation and configuration management', aliases: ['ansible-playbook'], sortOrder: 223 },
  { canonicalName: 'AWS CDK', slug: 'aws-cdk', category: 'CONTAINERS', subcategory: 'Infrastructure as Code', skillType: 'TECHNOLOGY', description: 'AWS Cloud Development Kit', aliases: ['cdk', 'cloud-development-kit'], sortOrder: 224 },
  { canonicalName: 'Bicep', slug: 'bicep', category: 'CONTAINERS', subcategory: 'Infrastructure as Code', skillType: 'TECHNOLOGY', description: 'Domain-specific language for deploying Azure resources', aliases: ['azure-bicep'], sortOrder: 225 },
  { canonicalName: 'Crossplane', slug: 'crossplane', category: 'CONTAINERS', subcategory: 'Infrastructure as Code', skillType: 'TECHNOLOGY', description: 'Kubernetes-native infrastructure management', aliases: ['crossplane-iac'], sortOrder: 226 },

  // =========================================================================
  // C. CI/CD / GITOPS
  // =========================================================================
  { canonicalName: 'GitHub Actions', slug: 'github-actions', category: 'CICD', subcategory: 'CI/CD Platforms', skillType: 'TECHNOLOGY', description: 'CI/CD platform integrated into GitHub', aliases: ['gh-actions', 'gha', 'github-workflows'], sortOrder: 300 },
  { canonicalName: 'GitLab CI/CD', slug: 'gitlab-ci', category: 'CICD', subcategory: 'CI/CD Platforms', skillType: 'TECHNOLOGY', description: 'GitLab integrated CI/CD system', aliases: ['gitlab-ci-cd', 'gitlab-pipelines'], sortOrder: 301 },
  { canonicalName: 'Jenkins', slug: 'jenkins', category: 'CICD', subcategory: 'CI/CD Platforms', skillType: 'TECHNOLOGY', description: 'Open-source automation server for CI/CD', aliases: ['jenkins-ci'], sortOrder: 302 },
  { canonicalName: 'CircleCI', slug: 'circleci', category: 'CICD', subcategory: 'CI/CD Platforms', skillType: 'TECHNOLOGY', description: 'Cloud-native CI/CD platform', aliases: ['circle-ci'], sortOrder: 303 },
  { canonicalName: 'Buildkite', slug: 'buildkite', category: 'CICD', subcategory: 'CI/CD Platforms', skillType: 'TECHNOLOGY', description: 'Scalable CI/CD platform', aliases: ['buildkite-ci'], sortOrder: 304 },
  { canonicalName: 'Argo CD', slug: 'argo-cd', category: 'CICD', subcategory: 'GitOps', skillType: 'TECHNOLOGY', description: 'GitOps continuous delivery for Kubernetes', aliases: ['argocd'], sortOrder: 310 },
  { canonicalName: 'Flux', slug: 'flux', category: 'CICD', subcategory: 'GitOps', skillType: 'TECHNOLOGY', description: 'GitOps toolkit for Kubernetes', aliases: ['fluxcd'], sortOrder: 311 },

  // =========================================================================
  // D. DATABASES / CACHE / SEARCH
  // =========================================================================
  { canonicalName: 'PostgreSQL', slug: 'postgresql', category: 'DATABASES', subcategory: 'Relational Databases', skillType: 'TECHNOLOGY', description: 'Advanced open-source relational database', aliases: ['postgres', 'pg'], sortOrder: 400 },
  { canonicalName: 'MySQL', slug: 'mysql', category: 'DATABASES', subcategory: 'Relational Databases', skillType: 'TECHNOLOGY', description: 'Open-source relational database', aliases: ['mysql-server'], sortOrder: 401 },
  { canonicalName: 'MariaDB', slug: 'mariadb', category: 'DATABASES', subcategory: 'Relational Databases', skillType: 'TECHNOLOGY', description: 'Community-developed relational database fork', aliases: ['maria'], sortOrder: 402 },
  { canonicalName: 'SQLite', slug: 'sqlite', category: 'DATABASES', subcategory: 'Relational Databases', skillType: 'TECHNOLOGY', description: 'Self-contained SQL database engine', aliases: ['sqlite3'], sortOrder: 403 },
  { canonicalName: 'SQL Server', slug: 'sql-server', category: 'DATABASES', subcategory: 'Relational Databases', skillType: 'TECHNOLOGY', description: 'Microsoft relational database management system', aliases: ['mssql', 'microsoft-sql-server'], sortOrder: 404 },
  { canonicalName: 'Oracle Database', slug: 'oracle-database', category: 'DATABASES', subcategory: 'Relational Databases', skillType: 'TECHNOLOGY', description: 'Oracle relational database management system', aliases: ['oracle', 'oracledb'], sortOrder: 405 },
  { canonicalName: 'MongoDB', slug: 'mongodb', category: 'DATABASES', subcategory: 'NoSQL Databases', skillType: 'TECHNOLOGY', description: 'Document-oriented NoSQL database', aliases: ['mongo', 'mongoose'], sortOrder: 410 },
  { canonicalName: 'DynamoDB', slug: 'dynamodb', category: 'DATABASES', subcategory: 'NoSQL Databases', skillType: 'TECHNOLOGY', description: 'AWS managed NoSQL database', aliases: ['amazon-dynamodb'], sortOrder: 411 },
  { canonicalName: 'Firestore', slug: 'firestore', category: 'DATABASES', subcategory: 'NoSQL Databases', skillType: 'TECHNOLOGY', description: 'Google Cloud NoSQL document database', aliases: ['cloud-firestore'], sortOrder: 412 },
  { canonicalName: 'Cassandra', slug: 'cassandra', category: 'DATABASES', subcategory: 'NoSQL Databases', skillType: 'TECHNOLOGY', description: 'Distributed NoSQL database', aliases: ['apache-cassandra'], sortOrder: 413 },
  { canonicalName: 'Redis', slug: 'redis', category: 'DATABASES', subcategory: 'Cache', skillType: 'TECHNOLOGY', description: 'In-memory data structure store', aliases: ['redis-server', 'ioredis'], sortOrder: 420 },
  { canonicalName: 'Memcached', slug: 'memcached', category: 'DATABASES', subcategory: 'Cache', skillType: 'TECHNOLOGY', description: 'Distributed memory caching system', aliases: ['memcache'], sortOrder: 421 },
  { canonicalName: 'Elasticsearch', slug: 'elasticsearch', category: 'DATABASES', subcategory: 'Search', skillType: 'TECHNOLOGY', description: 'Distributed search and analytics engine', aliases: ['elastic', 'elk'], sortOrder: 430 },
  { canonicalName: 'OpenSearch', slug: 'opensearch', category: 'DATABASES', subcategory: 'Search', skillType: 'TECHNOLOGY', description: 'Open-source search and analytics suite', aliases: ['aws-opensearch'], sortOrder: 431 },
  { canonicalName: 'ClickHouse', slug: 'clickhouse', category: 'DATABASES', subcategory: 'Analytics', skillType: 'TECHNOLOGY', description: 'Column-oriented OLAP database management system', aliases: ['clickhouse-db'], sortOrder: 440 },
  { canonicalName: 'Snowflake', slug: 'snowflake', category: 'DATABASES', subcategory: 'Analytics', skillType: 'TECHNOLOGY', description: 'Cloud-based data warehousing platform', aliases: ['snowflake-dw'], sortOrder: 441 },
  { canonicalName: 'Pinecone', slug: 'pinecone', category: 'DATABASES', subcategory: 'Vector Databases', skillType: 'TECHNOLOGY', description: 'Managed vector database for AI applications', aliases: ['pinecone-db'], sortOrder: 450 },
  { canonicalName: 'Weaviate', slug: 'weaviate', category: 'DATABASES', subcategory: 'Vector Databases', skillType: 'TECHNOLOGY', description: 'AI-native vector search engine', aliases: ['weaviate-db'], sortOrder: 451 },
  { canonicalName: 'Milvus', slug: 'milvus', category: 'DATABASES', subcategory: 'Vector Databases', skillType: 'TECHNOLOGY', description: 'Open-source vector database', aliases: ['milvus-db'], sortOrder: 452 },
  { canonicalName: 'Chroma', slug: 'chroma', category: 'DATABASES', subcategory: 'Vector Databases', skillType: 'TECHNOLOGY', description: 'Open-source embedding database', aliases: ['chromadb'], sortOrder: 453 },
  { canonicalName: 'FAISS', slug: 'faiss', category: 'DATABASES', subcategory: 'Vector Databases', skillType: 'TECHNOLOGY', description: 'Library for efficient similarity search', aliases: ['facebook-faiss'], sortOrder: 454 },

  // =========================================================================
  // E. MESSAGING / EVENT STREAMING
  // =========================================================================
  { canonicalName: 'Apache Kafka', slug: 'kafka', category: 'MESSAGING', subcategory: 'Event Streaming', skillType: 'TECHNOLOGY', description: 'Distributed event streaming platform', aliases: ['kafka', 'apache-kafka'], sortOrder: 500 },
  { canonicalName: 'RabbitMQ', slug: 'rabbitmq', category: 'MESSAGING', subcategory: 'Message Brokers', skillType: 'TECHNOLOGY', description: 'Open-source message broker', aliases: ['amqp', 'rabbit-mq'], sortOrder: 510 },
  { canonicalName: 'NATS', slug: 'nats', category: 'MESSAGING', subcategory: 'Message Brokers', skillType: 'TECHNOLOGY', description: 'High-performance messaging system', aliases: ['nats-server', 'nats-jetstream'], sortOrder: 511 },
  { canonicalName: 'Apache Pulsar', slug: 'pulsar', category: 'MESSAGING', subcategory: 'Event Streaming', skillType: 'TECHNOLOGY', description: 'Cloud-native distributed messaging and streaming', aliases: ['apache-pulsar'], sortOrder: 512 },

  // =========================================================================
  // F. NETWORKING
  // =========================================================================
  { canonicalName: 'NGINX', slug: 'nginx', category: 'NETWORKING', subcategory: 'Web Servers', skillType: 'TECHNOLOGY', description: 'High-performance web server and reverse proxy', aliases: ['nginx-reverse-proxy'], sortOrder: 600 },
  { canonicalName: 'HAProxy', slug: 'haproxy', category: 'NETWORKING', subcategory: 'Load Balancers', skillType: 'TECHNOLOGY', description: 'TCP/HTTP load balancer and proxy server', aliases: ['haproxy-lb'], sortOrder: 610 },
  { canonicalName: 'Reverse Proxy', slug: 'reverse-proxy', category: 'NETWORKING', subcategory: 'Patterns', skillType: 'CONCEPT', description: 'Server that sits between clients and backend servers', aliases: ['reverse-proxy-pattern'], sortOrder: 620 },
  { canonicalName: 'Load Balancing', slug: 'load-balancing', category: 'NETWORKING', subcategory: 'Patterns', skillType: 'CONCEPT', description: 'Distributing network traffic across multiple servers', aliases: ['load-balancer'], sortOrder: 621 },
  { canonicalName: 'CDN', slug: 'cdn', category: 'NETWORKING', subcategory: 'Content Delivery', skillType: 'CONCEPT', description: 'Content Delivery Network for edge caching', aliases: ['content-delivery-network'], sortOrder: 630 },
  { canonicalName: 'DNS', slug: 'dns', category: 'NETWORKING', subcategory: 'Core', skillType: 'CONCEPT', description: 'Domain Name System for internet name resolution', aliases: ['domain-name-system'], sortOrder: 640 },
  { canonicalName: 'TCP/IP', slug: 'tcp-ip', category: 'NETWORKING', subcategory: 'Core', skillType: 'CONCEPT', description: 'Fundamental networking protocol suite', aliases: ['tcpip'], sortOrder: 641 },
  { canonicalName: 'HTTP/2', slug: 'http2', category: 'NETWORKING', subcategory: 'Protocols', skillType: 'TECHNOLOGY', description: 'HTTP protocol version 2 with multiplexing', aliases: ['h2'], sortOrder: 650 },
  { canonicalName: 'HTTP/3', slug: 'http3', category: 'NETWORKING', subcategory: 'Protocols', skillType: 'TECHNOLOGY', description: 'HTTP protocol version 3 over QUIC', aliases: ['h3', 'quic'], sortOrder: 651 },
  { canonicalName: 'TLS/SSL', slug: 'tls-ssl', category: 'NETWORKING', subcategory: 'Security', skillType: 'TECHNOLOGY', description: 'Transport Layer Security and Secure Sockets Layer', aliases: ['ssl', 'tls', 'ssl-tls'], sortOrder: 660 },
  { canonicalName: 'WebSocket', slug: 'websocket', category: 'NETWORKING', subcategory: 'Protocols', skillType: 'TECHNOLOGY', description: 'Full-duplex communication protocol over TCP', aliases: ['websockets', 'ws'], sortOrder: 670 },
  { canonicalName: 'gRPC', slug: 'grpc', category: 'NETWORKING', subcategory: 'Protocols', skillType: 'TECHNOLOGY', description: 'High-performance RPC framework', aliases: ['grpc-web'], sortOrder: 680 },
  { canonicalName: 'API Gateway', slug: 'api-gateway', category: 'NETWORKING', subcategory: 'Patterns', skillType: 'CONCEPT', description: 'Entry point for API requests in microservices', aliases: ['api-gateway-pattern'], sortOrder: 690 },
  { canonicalName: 'Service Discovery', slug: 'service-discovery', category: 'NETWORKING', subcategory: 'Patterns', skillType: 'CONCEPT', description: 'Automatic detection of services in a network', aliases: ['service-mesh'], sortOrder: 691 },
  { canonicalName: 'VPN', slug: 'vpn', category: 'NETWORKING', subcategory: 'Security', skillType: 'TECHNOLOGY', description: 'Virtual Private Network for secure remote access', aliases: ['virtual-private-network'], sortOrder: 692 },

  // =========================================================================
  // G. OBSERVABILITY / RELIABILITY
  // =========================================================================
  { canonicalName: 'OpenTelemetry', slug: 'opentelemetry', category: 'OBSERVABILITY', subcategory: 'Instrumentation', skillType: 'TECHNOLOGY', description: 'Observability framework for cloud-native software', aliases: ['otel', 'o11y'], sortOrder: 700 },
  { canonicalName: 'Prometheus', slug: 'prometheus', category: 'OBSERVABILITY', subcategory: 'Metrics', skillType: 'TECHNOLOGY', description: 'Open-source monitoring and alerting toolkit', aliases: ['prom'], sortOrder: 710 },
  { canonicalName: 'Grafana', slug: 'grafana', category: 'OBSERVABILITY', subcategory: 'Visualization', skillType: 'TECHNOLOGY', description: 'Open-source analytics and monitoring platform', aliases: ['grafana-dashboards'], sortOrder: 720 },
  { canonicalName: 'Loki', slug: 'loki', category: 'OBSERVABILITY', subcategory: 'Logging', skillType: 'TECHNOLOGY', description: 'Horizontally scalable log aggregation system', aliases: ['grafana-loki'], sortOrder: 730 },
  { canonicalName: 'Jaeger', slug: 'jaeger', category: 'OBSERVABILITY', subcategory: 'Tracing', skillType: 'TECHNOLOGY', description: 'Open-source distributed tracing system', aliases: ['jaeger-tracing'], sortOrder: 740 },
  { canonicalName: 'Sentry', slug: 'sentry', category: 'OBSERVABILITY', subcategory: 'Error Tracking', skillType: 'TECHNOLOGY', description: 'Application monitoring and error tracking', aliases: ['sentry-io'], sortOrder: 750 },
  { canonicalName: 'Datadog', slug: 'datadog', category: 'OBSERVABILITY', subcategory: 'Platforms', skillType: 'TECHNOLOGY', description: 'Cloud-scale monitoring and analytics platform', aliases: ['dd-agent'], sortOrder: 760 },
  { canonicalName: 'New Relic', slug: 'new-relic', category: 'OBSERVABILITY', subcategory: 'Platforms', skillType: 'TECHNOLOGY', description: 'Full-stack observability platform', aliases: ['newrelic'], sortOrder: 761 },
  { canonicalName: 'ELK Stack', slug: 'elk-stack', category: 'OBSERVABILITY', subcategory: 'Logging', skillType: 'TECHNOLOGY', description: 'Elasticsearch, Logstash, and Kibana stack', aliases: ['elastic-stack'], sortOrder: 770 },

  // Observability concepts
  { canonicalName: 'Distributed Tracing', slug: 'distributed-tracing', category: 'OBSERVABILITY', subcategory: 'Concepts', skillType: 'CONCEPT', description: 'Tracking requests across microservice boundaries', aliases: [], sortOrder: 780 },
  { canonicalName: 'SLI/SLO/SLA', slug: 'sli-slo-sla', category: 'OBSERVABILITY', subcategory: 'Concepts', skillType: 'CONCEPT', description: 'Service Level Indicators, Objectives, and Agreements', aliases: ['service-level-objectives'], sortOrder: 781 },
  { canonicalName: 'Incident Response', slug: 'incident-response', category: 'OBSERVABILITY', subcategory: 'Practices', skillType: 'PRACTICE', description: 'Structured approach to managing production incidents', aliases: ['on-call', 'incident-management'], sortOrder: 782 },
  { canonicalName: 'Performance Optimization', slug: 'performance-optimization', category: 'OBSERVABILITY', subcategory: 'Concepts', skillType: 'PRACTICE', description: 'Systematic improvement of application performance', aliases: ['perf-optimization'], sortOrder: 783 },

  // =========================================================================
  // H. SECURITY / IDENTITY
  // =========================================================================
  { canonicalName: 'OAuth 2.0', slug: 'oauth', category: 'SECURITY', subcategory: 'Auth', skillType: 'TECHNOLOGY', description: 'Open standard for access delegation', aliases: ['oauth2', 'oauth-2-0', 'oauth2.1', 'pkce'], sortOrder: 800 },
  { canonicalName: 'OpenID Connect', slug: 'openid-connect', category: 'SECURITY', subcategory: 'Auth', skillType: 'TECHNOLOGY', description: 'Identity layer on top of OAuth 2.0', aliases: ['oidc'], sortOrder: 801 },
  { canonicalName: 'SAML', slug: 'saml', category: 'SECURITY', subcategory: 'Federation', skillType: 'TECHNOLOGY', description: 'XML-based federated identity standard', aliases: ['saml-2.0'], sortOrder: 810 },
  { canonicalName: 'SSO', slug: 'sso', category: 'SECURITY', subcategory: 'Federation', skillType: 'CONCEPT', description: 'Single Sign-On authentication scheme', aliases: ['single-sign-on'], sortOrder: 811 },
  { canonicalName: 'LDAP', slug: 'ldap', category: 'SECURITY', subcategory: 'Directories', skillType: 'TECHNOLOGY', description: 'Lightweight Directory Access Protocol', aliases: ['openldap'], sortOrder: 820 },
  { canonicalName: 'Active Directory', slug: 'active-directory', category: 'SECURITY', subcategory: 'Directories', skillType: 'TECHNOLOGY', description: 'Microsoft directory service', aliases: ['ad', 'azure-ad', 'entra-id'], sortOrder: 821 },
  { canonicalName: 'SCIM', slug: 'scim', category: 'SECURITY', subcategory: 'Provisioning', skillType: 'TECHNOLOGY', description: 'System for Cross-domain Identity Management', aliases: ['scim-protocol'], sortOrder: 830 },
  { canonicalName: 'JWT', slug: 'jwt', category: 'SECURITY', subcategory: 'Tokens', skillType: 'TECHNOLOGY', description: 'JSON Web Tokens for compact claims representation', aliases: ['json-web-token'], sortOrder: 840 },
  { canonicalName: 'RBAC', slug: 'rbac', category: 'SECURITY', subcategory: 'Authorization', skillType: 'CONCEPT', description: 'Role-Based Access Control', aliases: ['role-based-access-control'], sortOrder: 850 },
  { canonicalName: 'ABAC', slug: 'abac', category: 'SECURITY', subcategory: 'Authorization', skillType: 'CONCEPT', description: 'Attribute-Based Access Control', aliases: ['attribute-based-access-control'], sortOrder: 851 },
  { canonicalName: 'ReBAC', slug: 'rebac', category: 'SECURITY', subcategory: 'Authorization', skillType: 'CONCEPT', description: 'Relationship-Based Access Control', aliases: ['relationship-based-access-control'], sortOrder: 852 },
  { canonicalName: 'Secrets Management', slug: 'secrets-management', category: 'SECURITY', subcategory: 'Practices', skillType: 'PRACTICE', description: 'Secure handling of credentials and secrets', aliases: ['vault', 'hashicorp-vault'], sortOrder: 860 },
  { canonicalName: 'Zero Trust', slug: 'zero-trust', category: 'SECURITY', subcategory: 'Architecture', skillType: 'CONCEPT', description: 'Security model requiring strict verification', aliases: ['zero-trust-architecture'], sortOrder: 870 },
  { canonicalName: 'Application Security', slug: 'application-security', category: 'SECURITY', subcategory: 'Practices', skillType: 'PRACTICE', description: 'Securing software applications against threats', aliases: ['appsec'], sortOrder: 880 },

  // =========================================================================
  // I. SOFTWARE ARCHITECTURE
  // =========================================================================
  { canonicalName: 'REST API Design', slug: 'rest-api', category: 'ARCHITECTURE', subcategory: 'API Design', skillType: 'CONCEPT', description: 'RESTful API architectural style', aliases: ['rest', 'restful', 'restful-api'], sortOrder: 900 },
  { canonicalName: 'GraphQL', slug: 'graphql', category: 'ARCHITECTURE', subcategory: 'API Design', skillType: 'TECHNOLOGY', description: 'Query language for APIs', aliases: ['gql', 'apollo-graphql'], sortOrder: 901 },
  { canonicalName: 'Microservices', slug: 'microservices', category: 'ARCHITECTURE', subcategory: 'Patterns', skillType: 'CONCEPT', description: 'Architectural style structuring apps as service collections', aliases: ['microservice-architecture'], sortOrder: 910 },
  { canonicalName: 'Modular Monolith', slug: 'modular-monolith', category: 'ARCHITECTURE', subcategory: 'Patterns', skillType: 'CONCEPT', description: 'Monolithic architecture with well-defined module boundaries', aliases: ['modular-monolithic'], sortOrder: 911 },
  { canonicalName: 'Event-Driven Architecture', slug: 'event-driven-architecture', category: 'ARCHITECTURE', subcategory: 'Patterns', skillType: 'CONCEPT', description: 'Architecture based on production and consumption of events', aliases: ['eda', 'event-driven'], sortOrder: 920 },
  { canonicalName: 'Serverless Architecture', slug: 'serverless', category: 'ARCHITECTURE', subcategory: 'Patterns', skillType: 'CONCEPT', description: 'Cloud computing execution model', aliases: ['faas'], sortOrder: 921 },
  { canonicalName: 'Domain-Driven Design', slug: 'ddd', category: 'ARCHITECTURE', subcategory: 'Patterns', skillType: 'CONCEPT', description: 'Software design approach focused on domain modeling', aliases: ['domain-driven-design'], sortOrder: 930 },
  { canonicalName: 'CQRS', slug: 'cqrs', category: 'ARCHITECTURE', subcategory: 'Patterns', skillType: 'CONCEPT', description: 'Command Query Responsibility Segregation', aliases: ['command-query-responsibility-segregation'], sortOrder: 931 },
  { canonicalName: 'Event Sourcing', slug: 'event-sourcing', category: 'ARCHITECTURE', subcategory: 'Patterns', skillType: 'CONCEPT', description: 'Storing state changes as a sequence of events', aliases: ['event-store'], sortOrder: 932 },
  { canonicalName: 'High Availability', slug: 'high-availability', category: 'ARCHITECTURE', subcategory: 'Patterns', skillType: 'CONCEPT', description: 'System design for maximum uptime', aliases: ['ha', 'fault-tolerant'], sortOrder: 940 },
  { canonicalName: 'Scalability', slug: 'scalability', category: 'ARCHITECTURE', subcategory: 'Concepts', skillType: 'CONCEPT', description: 'Ability to handle growing workload efficiently', aliases: ['horizontal-scaling', 'vertical-scaling'], sortOrder: 941 },
  { canonicalName: 'Idempotency', slug: 'idempotency', category: 'ARCHITECTURE', subcategory: 'Concepts', skillType: 'CONCEPT', description: 'Property ensuring repeated operations produce same result', aliases: ['idempotent'], sortOrder: 942 },
  { canonicalName: 'Circuit Breaker', slug: 'circuit-breaker', category: 'ARCHITECTURE', subcategory: 'Resilience', skillType: 'CONCEPT', description: 'Prevents cascading failures in distributed systems', aliases: ['circuit-breaker-pattern'], sortOrder: 950 },
  { canonicalName: 'Multi-Tenant Architecture', slug: 'multi-tenant', category: 'ARCHITECTURE', subcategory: 'Patterns', skillType: 'CONCEPT', description: 'Software architecture serving multiple tenants', aliases: ['multi-tenancy'], sortOrder: 960 },

  // =========================================================================
  // J. DEVELOPMENT / TESTING
  // =========================================================================
  { canonicalName: 'Unit Testing', slug: 'unit-testing', category: 'DEVELOPMENT', subcategory: 'Testing', skillType: 'PRACTICE', description: 'Testing individual units of source code', aliases: ['unit-tests'], sortOrder: 1000 },
  { canonicalName: 'Integration Testing', slug: 'integration-testing', category: 'DEVELOPMENT', subcategory: 'Testing', skillType: 'PRACTICE', description: 'Testing combined parts of an application', aliases: ['integration-tests'], sortOrder: 1001 },
  { canonicalName: 'End-to-End Testing', slug: 'e2e-testing', category: 'DEVELOPMENT', subcategory: 'Testing', skillType: 'PRACTICE', description: 'Testing the complete application flow', aliases: ['e2e-tests', 'e2e'], sortOrder: 1002 },
  { canonicalName: 'Contract Testing', slug: 'contract-testing', category: 'DEVELOPMENT', subcategory: 'Testing', skillType: 'PRACTICE', description: 'Testing API contracts between services', aliases: ['pact'], sortOrder: 1003 },
  { canonicalName: 'Test-Driven Development', slug: 'tdd', category: 'DEVELOPMENT', subcategory: 'Practices', skillType: 'PRACTICE', description: 'Development cycle: write test, implement, refactor', aliases: ['test-driven'], sortOrder: 1010 },
  { canonicalName: 'Load Testing', slug: 'load-testing', category: 'DEVELOPMENT', subcategory: 'Testing', skillType: 'PRACTICE', description: 'Testing system behavior under expected load', aliases: ['performance-testing'], sortOrder: 1020 },
  { canonicalName: 'Chaos Engineering', slug: 'chaos-engineering', category: 'DEVELOPMENT', subcategory: 'Practices', skillType: 'PRACTICE', description: 'Experimenting on systems to build resilience', aliases: ['chaos-testing'], sortOrder: 1030 },
  { canonicalName: 'Code Review', slug: 'code-review', category: 'DEVELOPMENT', subcategory: 'Practices', skillType: 'PRACTICE', description: 'Systematic examination of source code', aliases: ['peer-review'], sortOrder: 1040 },
  { canonicalName: 'Git', slug: 'git', category: 'DEVELOPMENT', subcategory: 'Tools', skillType: 'TECHNOLOGY', description: 'Distributed version control system', aliases: ['git-vcs'], sortOrder: 1050 },
  { canonicalName: 'GitHub', slug: 'github', category: 'DEVELOPMENT', subcategory: 'Tools', skillType: 'TECHNOLOGY', description: 'Developer platform for code hosting and collaboration', aliases: ['github-platform'], sortOrder: 1051 },

  // =========================================================================
  // K. AI-ASSISTED DEVELOPMENT
  // =========================================================================
  { canonicalName: 'AI-Assisted Development', slug: 'ai-assisted-development', category: 'AI_DEVELOPMENT', subcategory: 'Core', skillType: 'PRACTICE', description: 'Using AI tools to enhance software development workflows', aliases: ['ai-coding', 'ai-native-development', 'agent-assisted-development'], sortOrder: 1100 },
  { canonicalName: 'GitHub Copilot', slug: 'github-copilot', category: 'AI_DEVELOPMENT', subcategory: 'Tools', skillType: 'TECHNOLOGY', description: 'AI pair programmer by GitHub', aliases: ['copilot'], sortOrder: 1110 },
  { canonicalName: 'Cursor', slug: 'cursor', category: 'AI_DEVELOPMENT', subcategory: 'Tools', skillType: 'TECHNOLOGY', description: 'AI-first code editor', aliases: ['cursor-ide'], sortOrder: 1111 },
  { canonicalName: 'Claude Code', slug: 'claude-code', category: 'AI_DEVELOPMENT', subcategory: 'Tools', skillType: 'TECHNOLOGY', description: 'Anthropic AI coding assistant', aliases: ['anthropic-code'], sortOrder: 1112 },
  { canonicalName: 'Windsurf', slug: 'windsurf', category: 'AI_DEVELOPMENT', subcategory: 'Tools', skillType: 'TECHNOLOGY', description: 'AI-powered IDE by Codeium', aliases: ['codeium-windsurf'], sortOrder: 1113 },
  { canonicalName: 'AI Code Review', slug: 'ai-code-review', category: 'AI_DEVELOPMENT', subcategory: 'Practices', skillType: 'PRACTICE', description: 'Using AI to review code quality and security', aliases: ['ai-review'], sortOrder: 1120 },
  { canonicalName: 'AI Test Generation', slug: 'ai-test-generation', category: 'AI_DEVELOPMENT', subcategory: 'Practices', skillType: 'PRACTICE', description: 'Using AI to generate test cases', aliases: ['ai-testing'], sortOrder: 1121 },

  // =========================================================================
  // L. GENERATIVE AI
  // =========================================================================
  { canonicalName: 'Large Language Models', slug: 'llm', category: 'GENAI', subcategory: 'Core', skillType: 'TECHNOLOGY', description: 'Advanced language models for text generation and understanding', aliases: ['large-language-models', 'llms'], sortOrder: 1200 },
  { canonicalName: 'LLM APIs', slug: 'llm-apis', category: 'GENAI', subcategory: 'Integration', skillType: 'TECHNOLOGY', description: 'APIs for accessing large language models', aliases: ['openai-api', 'anthropic-api', 'gemini-api'], sortOrder: 1201 },
  { canonicalName: 'Prompt Engineering', slug: 'prompt-engineering', category: 'GENAI', subcategory: 'Practices', skillType: 'PRACTICE', description: 'Crafting effective prompts for AI models', aliases: ['prompting', 'prompt-design'], sortOrder: 1210 },
  { canonicalName: 'RAG', slug: 'rag', category: 'GENAI', subcategory: 'Patterns', skillType: 'CONCEPT', description: 'Retrieval-Augmented Generation for grounding LLMs', aliases: ['retrieval-augmented-generation'], sortOrder: 1220 },
  { canonicalName: 'Context Engineering', slug: 'context-engineering', category: 'GENAI', subcategory: 'Practices', skillType: 'PRACTICE', description: 'Designing context for optimal LLM performance', aliases: ['context-design'], sortOrder: 1221 },
  { canonicalName: 'Embeddings', slug: 'embeddings', category: 'GENAI', subcategory: 'Core', skillType: 'TECHNOLOGY', description: 'Vector representations of text for semantic search', aliases: ['text-embeddings', 'vector-embeddings'], sortOrder: 1230 },
  { canonicalName: 'Vector Search', slug: 'vector-search', category: 'GENAI', subcategory: 'Core', skillType: 'CONCEPT', description: 'Similarity search using vector embeddings', aliases: ['semantic-search'], sortOrder: 1231 },
  { canonicalName: 'Structured Outputs', slug: 'structured-outputs', category: 'GENAI', subcategory: 'Patterns', skillType: 'CONCEPT', description: 'Getting LLMs to produce structured JSON responses', aliases: ['json-mode', 'function-calling'], sortOrder: 1240 },
  { canonicalName: 'LLM Evaluation', slug: 'llm-evaluation', category: 'GENAI', subcategory: 'Quality', skillType: 'PRACTICE', description: 'Measuring and improving LLM output quality', aliases: ['ai-evaluation'], sortOrder: 1250 },
  { canonicalName: 'AI Guardrails', slug: 'ai-guardrails', category: 'GENAI', subcategory: 'Safety', skillType: 'CONCEPT', description: 'Safety mechanisms for AI system outputs', aliases: ['ai-safety', 'content-filtering'], sortOrder: 1260 },
  { canonicalName: 'Fine-Tuning', slug: 'fine-tuning', category: 'GENAI', subcategory: 'Training', skillType: 'PRACTICE', description: 'Adapting pre-trained models for specific tasks', aliases: ['model-fine-tuning', 'lora'], sortOrder: 1270 },

  // =========================================================================
  // M. AI AGENTS
  // =========================================================================
  { canonicalName: 'AI Agents', slug: 'ai-agents', category: 'AI_AGENTS', subcategory: 'Core', skillType: 'CONCEPT', description: 'Autonomous AI systems that use tools and make decisions', aliases: ['agentic-ai', 'ai-agent'], sortOrder: 1300 },
  { canonicalName: 'Agentic Workflows', slug: 'agentic-workflows', category: 'AI_AGENTS', subcategory: 'Patterns', skillType: 'CONCEPT', description: 'Multi-step autonomous AI task execution patterns', aliases: ['agent-workflows'], sortOrder: 1310 },
  { canonicalName: 'Multi-Agent Systems', slug: 'multi-agent-systems', category: 'AI_AGENTS', subcategory: 'Patterns', skillType: 'CONCEPT', description: 'Systems with multiple AI agents collaborating', aliases: ['multi-agent'], sortOrder: 1311 },
  { canonicalName: 'Agent Orchestration', slug: 'agent-orchestration', category: 'AI_AGENTS', subcategory: 'Patterns', skillType: 'CONCEPT', description: 'Coordinating multiple AI agents and tools', aliases: ['orchestration'], sortOrder: 1312 },
  { canonicalName: 'Agent Memory', slug: 'agent-memory', category: 'AI_AGENTS', subcategory: 'Patterns', skillType: 'CONCEPT', description: 'State and context persistence for AI agents', aliases: ['memory-systems'], sortOrder: 1313 },
  { canonicalName: 'Human-in-the-Loop AI', slug: 'human-in-the-loop', category: 'AI_AGENTS', subcategory: 'Patterns', skillType: 'CONCEPT', description: 'AI systems with human oversight and approval', aliases: ['hitl'], sortOrder: 1314 },
  { canonicalName: 'LangChain', slug: 'langchain', category: 'AI_AGENTS', subcategory: 'Frameworks', skillType: 'TECHNOLOGY', description: 'Framework for building LLM-powered applications', aliases: ['lang-chain'], sortOrder: 1320 },
  { canonicalName: 'LangGraph', slug: 'langgraph', category: 'AI_AGENTS', subcategory: 'Frameworks', skillType: 'TECHNOLOGY', description: 'Framework for building stateful multi-actor applications', aliases: ['lang-graph'], sortOrder: 1321 },
  { canonicalName: 'CrewAI', slug: 'crewai', category: 'AI_AGENTS', subcategory: 'Frameworks', skillType: 'TECHNOLOGY', description: 'Framework for orchestrating role-playing AI agents', aliases: ['crew-ai'], sortOrder: 1322 },
  { canonicalName: 'Google ADK', slug: 'google-adk', category: 'AI_AGENTS', subcategory: 'Frameworks', skillType: 'TECHNOLOGY', description: 'Google Agent Development Kit', aliases: ['agent-dev-kit'], sortOrder: 1323 },
  { canonicalName: 'OpenAI Agents SDK', slug: 'openai-agents-sdk', category: 'AI_AGENTS', subcategory: 'Frameworks', skillType: 'TECHNOLOGY', description: 'OpenAI Agents SDK for building AI agents', aliases: ['openai-agent'], sortOrder: 1324 },
  { canonicalName: 'PydanticAI', slug: 'pydantic-ai', category: 'AI_AGENTS', subcategory: 'Frameworks', skillType: 'TECHNOLOGY', description: 'Agent framework using Pydantic for structured outputs', aliases: ['pydantic-ai-agent'], sortOrder: 1325 },

  // =========================================================================
  // N. MCP / AI INTEROPERABILITY
  // =========================================================================
  { canonicalName: 'Model Context Protocol', slug: 'mcp', category: 'MCP', subcategory: 'Core', skillType: 'TECHNOLOGY', description: 'Open standard for AI-tool connectivity', aliases: ['model-context-protocol', 'mcp-server', 'mcp-client'], sortOrder: 1400 },
  { canonicalName: 'Agent-to-Agent Protocol', slug: 'a2a', category: 'MCP', subcategory: 'Interoperability', skillType: 'CONCEPT', description: 'Protocol for agent-to-agent communication', aliases: ['agent-to-agent'], sortOrder: 1410 },
  { canonicalName: 'Tool Interoperability', slug: 'tool-interoperability', category: 'MCP', subcategory: 'Concepts', skillType: 'CONCEPT', description: 'Standardized tool interfaces across AI systems', aliases: ['function-calling-standard'], sortOrder: 1420 },

  // =========================================================================
  // O. AI EVALUATION / QUALITY
  // =========================================================================
  { canonicalName: 'Promptfoo', slug: 'promptfoo', category: 'AI_QUALITY', subcategory: 'Tools', skillType: 'TECHNOLOGY', description: 'LLM evaluation and red teaming framework', aliases: ['prompt-foo'], sortOrder: 1500 },
  { canonicalName: 'RAGAS', slug: 'ragas', category: 'AI_QUALITY', subcategory: 'Tools', skillType: 'TECHNOLOGY', description: 'RAG evaluation framework', aliases: ['rag-eval'], sortOrder: 1501 },
  { canonicalName: 'LangSmith', slug: 'langsmith', category: 'AI_QUALITY', subcategory: 'Platforms', skillType: 'TECHNOLOGY', description: 'LLM observability and evaluation platform', aliases: ['lang-smith'], sortOrder: 1510 },
  { canonicalName: 'Langfuse', slug: 'langfuse', category: 'AI_QUALITY', subcategory: 'Platforms', skillType: 'TECHNOLOGY', description: 'Open-source LLM engineering platform', aliases: ['lang-fuse'], sortOrder: 1511 },
  { canonicalName: 'AI Red Teaming', slug: 'ai-red-teaming', category: 'AI_QUALITY', subcategory: 'Practices', skillType: 'PRACTICE', description: 'Adversarial testing of AI systems', aliases: ['red-teaming'], sortOrder: 1520 },
  { canonicalName: 'Hallucination Detection', slug: 'hallucination-detection', category: 'AI_QUALITY', subcategory: 'Practices', skillType: 'PRACTICE', description: 'Identifying and mitigating LLM factual errors', aliases: ['hallucination-detection'], sortOrder: 1521 },

  // =========================================================================
  // P. MLOPS / AI PLATFORM
  // =========================================================================
  { canonicalName: 'Model Serving', slug: 'model-serving', category: 'MLOPS', subcategory: 'Deployment', skillType: 'CONCEPT', description: 'Deploying ML models for inference at scale', aliases: ['model-deployment'], sortOrder: 1600 },
  { canonicalName: 'ML Pipelines', slug: 'ml-pipelines', category: 'MLOPS', subcategory: 'Automation', skillType: 'CONCEPT', description: 'Automated ML workflow orchestration', aliases: ['ml-workflow'], sortOrder: 1601 },
  { canonicalName: 'MLflow', slug: 'mlflow', category: 'MLOPS', subcategory: 'Tools', skillType: 'TECHNOLOGY', description: 'Open-source ML lifecycle management', aliases: ['ml-flow'], sortOrder: 1610 },
  { canonicalName: 'Kubeflow', slug: 'kubeflow', category: 'MLOPS', subcategory: 'Tools', skillType: 'TECHNOLOGY', description: 'ML toolkit for Kubernetes', aliases: ['kubeflow-pipelines'], sortOrder: 1611 },
  { canonicalName: 'Ray', slug: 'ray', category: 'MLOPS', subcategory: 'Compute', skillType: 'TECHNOLOGY', description: 'Distributed computing framework for ML workloads', aliases: ['ray-ml'], sortOrder: 1620 },
  { canonicalName: 'KServe', slug: 'kserve', category: 'MLOPS', subcategory: 'Serving', skillType: 'TECHNOLOGY', description: 'Model serving on Kubernetes', aliases: ['kfserving'], sortOrder: 1630 },

  // =========================================================================
  // Q. DEVELOPER EXPERIENCE / PLATFORM ENGINEERING
  // =========================================================================
  { canonicalName: 'Developer Experience', slug: 'developer-experience', category: 'DX', subcategory: 'Core', skillType: 'PRACTICE', description: 'Optimizing developer productivity and satisfaction', aliases: ['devex', 'dx'], sortOrder: 1700 },
  { canonicalName: 'Internal Developer Platform', slug: 'idp', category: 'DX', subcategory: 'Platforms', skillType: 'CONCEPT', description: 'Self-service platform for developer workflows', aliases: ['internal-developer-platform'], sortOrder: 1710 },
  { canonicalName: 'Backstage', slug: 'backstage', category: 'DX', subcategory: 'Tools', skillType: 'TECHNOLOGY', description: 'Spotify open-source developer portal', aliases: ['backstage-io'], sortOrder: 1720 },
  { canonicalName: 'CLI Development', slug: 'cli-development', category: 'DX', subcategory: 'Skills', skillType: 'PRACTICE', description: 'Building effective command-line interfaces', aliases: ['cli-design'], sortOrder: 1730 },

  // =========================================================================
  // R. ENGINEERING PRACTICES
  // =========================================================================
  { canonicalName: 'Pull Requests', slug: 'pull-requests', category: 'PRACTICES', subcategory: 'Code Management', skillType: 'PRACTICE', description: 'Collaborative code review and merge workflow', aliases: ['pr', 'merge-requests'], sortOrder: 1800 },
  { canonicalName: 'Architecture Decision Records', slug: 'adr', category: 'PRACTICES', subcategory: 'Documentation', skillType: 'PRACTICE', description: 'Documents for recording architectural decisions', aliases: ['architecture-decisions'], sortOrder: 1810 },
  { canonicalName: 'Technical Documentation', slug: 'technical-documentation', category: 'PRACTICES', subcategory: 'Documentation', skillType: 'PRACTICE', description: 'Writing clear technical documentation', aliases: ['tech-docs'], sortOrder: 1811 },
  { canonicalName: 'Agile', slug: 'agile', category: 'PRACTICES', subcategory: 'Methodology', skillType: 'PRACTICE', description: 'Iterative software development methodology', aliases: ['agile-methodology'], sortOrder: 1820 },
  { canonicalName: 'Scrum', slug: 'scrum', category: 'PRACTICES', subcategory: 'Methodology', skillType: 'PRACTICE', description: 'Agile framework for managing knowledge work', aliases: ['scrum-framework'], sortOrder: 1821 },
  { canonicalName: 'Kanban', slug: 'kanban', category: 'PRACTICES', subcategory: 'Methodology', skillType: 'PRACTICE', description: 'Visual workflow management method', aliases: ['kanban-board'], sortOrder: 1822 },
];

/**
 * Returns a flat list of all unique categories from the catalog seed.
 * @returns {string[]}
 */
export function getCatalogCategories() {
  const cats = new Set(SKILL_CATALOG_SEED.map(s => s.category));
  return [...cats].sort();
}

/**
 * Returns catalog entries filtered by category.
 * @param {string} category
 * @returns {Array}
 */
export function getCatalogByCategory(category) {
  return SKILL_CATALOG_SEED.filter(s => s.category === category);
}
