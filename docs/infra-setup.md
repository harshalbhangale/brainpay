# BrainPal Infrastructure Setup Log

**Date:** May 21, 2026  
**Region:** `ap-southeast-2` (Sydney)  
**AWS Account:** `140023397454`  
**Live API:** `https://api.zapfan.com`

---

## What Was Set Up

### 1. AWS CLI + IAM User

- Installed AWS CLI via Homebrew
- IAM user `brainpal` created with the following policies:
  - `AmazonECS_FullAccess`
  - `AmazonEC2ContainerRegistryFullAccess`
  - `SecretsManagerReadWrite`
  - `CloudWatchLogsFullAccess`
  - `ElasticLoadBalancingFullAccess`
  - `IAMFullAccess`
  - `AWSCertificateManagerFullAccess`
  - `AmazonRoute53FullAccess`
- CLI configured with access key for `brainpal` user

---

### 2. ECR (Elastic Container Registry)

- Repository: `brainpal-api`
- Image scanning on push: enabled
- Registry: `140023397454.dkr.ecr.ap-southeast-2.amazonaws.com/brainpal-api`
- Tags pushed: `<git-sha>` + `latest`

---

### 3. ECS Cluster

- Cluster name: `brainpal-prod`
- Capacity provider: `FARGATE`
- Service: `brainpal-api`
  - Desired count: 1
  - Task definition: `brainpal-api` (currently revision 4)
  - CPU: 512 / Memory: 1024 MB
  - Health check: `GET /health` → expects HTTP 200

---

### 4. IAM Roles for ECS

| Role | Purpose |
|---|---|
| `ecsTaskExecutionRole` | Pulls images from ECR, reads Secrets Manager, writes CloudWatch logs |
| `brainpal-api-task-role` | Runtime permissions for the container itself |

---

### 5. Secrets Manager

- Secret name: `brainpal/prod/api`
- ARN: `arn:aws:secretsmanager:ap-southeast-2:140023397454:secret:brainpal/prod/api-YqmX4c`
- Keys stored:

| Key | Status |
|---|---|
| `SUPABASE_URL` | ✅ Postgres direct connection string |
| `SUPABASE_API_URL` | ✅ `https://mcmfnicppawfxktruigg.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ Set |
| `GEMINI_API_KEY` | ✅ Set |
| `XAI_API_KEY` | ✅ Set |
| `ELEVENLABS_API_KEY` | ✅ Set |
| `ELEVENLABS_VOICE_ID` | ✅ Set |
| `SENTRY_DSN_API` | ✅ Set |

---

### 6. CloudWatch Logs

- Log group: `/ecs/brainpal-api`
- Stream prefix: `api`
- View logs: AWS Console → CloudWatch → Log groups → `/ecs/brainpal-api`

---

### 7. Networking

**VPC:** `vpc-0ff245677fcd27388` (default)

**Subnets (all public):**
| AZ | Subnet ID |
|---|---|
| ap-southeast-2a | `subnet-0486113877e97ee5c` |
| ap-southeast-2b | `subnet-0cb6313077c681e1d` |
| ap-southeast-2c | `subnet-0b56355f28c0fade2` |

**Security Groups:**
| Name | ID | Rules |
|---|---|---|
| `brainpal-alb-sg` | `sg-0675658e2de517327` | Inbound 80, 443 from `0.0.0.0/0` |
| `brainpal-ecs-sg` | `sg-019e26bfa62dbed5b` | Inbound 3000 from ALB SG only |

---

### 8. Application Load Balancer

- Name: `brainpal-alb`
- DNS: `brainpal-alb-635421280.ap-southeast-2.elb.amazonaws.com`
- ARN: `arn:aws:elasticloadbalancing:ap-southeast-2:140023397454:loadbalancer/app/brainpal-alb/1e95e654bb8a5476`
- Listeners:
  - Port 80 → redirects to HTTPS 443
  - Port 443 → forwards to target group `brainpal-api-tg`
- TLS policy: `ELBSecurityPolicy-TLS13-1-2-2021-06`

**Target Group:**
- Name: `brainpal-api-tg`
- Protocol: HTTP, Port 3000
- Target type: IP (Fargate)
- Health check: `GET /health`, interval 15s
- Stickiness: ON (lb_cookie, 24h) — required for WebSocket in-process state

---

### 9. SSL Certificate (ACM)

- Domain: `api.zapfan.com`
- ARN: `arn:aws:acm:ap-southeast-2:140023397454:certificate/c85fd722-a9b5-4d65-81a9-64dc15e7e6e3`
- Validation: DNS (CNAME added to Route 53 automatically)
- Status: ✅ Issued

---

### 10. DNS (Route 53)

- Hosted zone: `zapfan.com` (`Z0119093MRX7AAKWRSV0`)
- Records added:
  - `api.zapfan.com` → A alias → ALB
  - ACM validation CNAME (auto-managed)
- **Note:** `api.zapfan.com` is a temporary domain. Migrate to `api.brainpal.tech` when that domain is acquired.

---

### 11. GitHub Actions CI/CD

**Repo:** `https://github.com/harshalbhangale/brainpay`

**Workflows:**

| File | Trigger | What it does |
|---|---|---|
| `.github/workflows/deploy-api.yml` | Push to `main` touching `apps/api/**`, `packages/shared/**`, `pnpm-lock.yaml` | Builds Docker image, pushes to ECR (SHA + latest tags), force-deploys ECS service |
| `.github/workflows/ci.yml` | All PRs + push to `main` | Installs deps, builds shared package, runs typecheck |

**Authentication:** OIDC (no stored AWS keys in GitHub)
- OIDC provider: `token.actions.githubusercontent.com`
- Role assumed: `arn:aws:iam::140023397454:role/github-actions-brainpal`
- GitHub secret set: `AWS_ROLE_TO_ASSUME`

---

### 12. Sentry

- Project: `brainpal-api` (Node.js)
- DSN stored in Secrets Manager and injected at runtime
- Platform: `https://sentry.io`

---

## Deploy Flow (ongoing)

```
git push origin main
  → GitHub Actions triggers deploy-api.yml
  → OIDC auth to AWS (no stored keys)
  → docker build (multi-stage, pnpm monorepo)
  → ECR push (:sha + :latest)
  → ecs update-service --force-new-deployment
  → waits for service stability
  → live at https://api.zapfan.com
```

---

## Useful Commands

```bash
# Check service status
aws ecs describe-services --region ap-southeast-2 --cluster brainpal-prod --services brainpal-api

# Tail logs
aws logs tail /ecs/brainpal-api --region ap-southeast-2 --follow

# Force redeploy without a code change
aws ecs update-service --region ap-southeast-2 --cluster brainpal-prod --service brainpal-api --force-new-deployment

# Update a secret value
aws secretsmanager put-secret-value --region ap-southeast-2 --secret-id brainpal/prod/api --secret-string file://secrets.prod.json

# Check live health
curl https://api.zapfan.com/health
```

---

## What's Next

- [ ] Migrate domain from `api.zapfan.com` → `api.brainpal.tech` once domain is acquired
- [ ] Set up CloudFront distribution in front of ALB (WebSocket pass-through)
- [ ] Add Supabase migrations to CI pipeline
- [ ] Wire Sentry SDK into the API (`@sentry/node`)
- [ ] Scale to desired-count > 1 → move session state to ElastiCache Redis (see `TODO(scale)` in `ws/handler.ts`)
- [ ] Set up mobile app deployment (Expo EAS)
