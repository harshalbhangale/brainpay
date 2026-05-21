# BrainPal Infra

All resources live in **`ap-southeast-2`** (Sydney). One off-region service blows the latency budget — see Build Deck §1, §5.

## What lives here

- `ecs-task-definition.json` — Fargate task template. `:NUMBER` placeholders are filled at register time.
- This README — the provisioning runbook.

## One-time provisioning (manual, ~30 min)

```bash
# vars
export AWS_REGION=ap-southeast-2
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export ECR_REGISTRY=$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# 1. ECR repo
aws ecr create-repository \
  --region $AWS_REGION \
  --repository-name brainpal-api \
  --image-scanning-configuration scanOnPush=true

# 2. Secrets Manager — store all API secrets as one JSON
aws secretsmanager create-secret \
  --region $AWS_REGION \
  --name brainpal/prod/api \
  --secret-string file://secrets.prod.json   # gitignored, generated locally

# 3. ECS cluster
aws ecs create-cluster \
  --region $AWS_REGION \
  --cluster-name brainpal-prod \
  --capacity-providers FARGATE

# 4. CloudWatch log group
aws logs create-log-group \
  --region $AWS_REGION \
  --log-group-name /ecs/brainpal-api

# 5. Task def — register from template (after filling ARNs)
aws ecs register-task-definition \
  --region $AWS_REGION \
  --cli-input-json file://infra/ecs-task-definition.json

# 6. ALB + target group + HTTPS listener (cert on us-east-1 for CloudFront, ap-southeast-2 for ALB)
#    Stickiness ON — required for in-process WS state.
#    See Build Deck § 5.

# 7. ECS service
aws ecs create-service \
  --region $AWS_REGION \
  --cluster brainpal-prod \
  --service-name brainpal-api \
  --task-definition brainpal-api \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[...],securityGroups=[...],assignPublicIp=ENABLED}" \
  --load-balancers "targetGroupArn=...,containerName=api,containerPort=3000"

# 8. CloudFront distribution → ALB origin (WS pass-through), Route 53 alias
#    api.brainpal.tech → CloudFront → ALB → ECS service
```

## Deploys

After provisioning, deploys are automated via `.github/workflows/deploy-api.yml` on push to `main`:

```
docker build → ECR push (tag = $GITHUB_SHA) → ecs update-service --force-new-deployment
```

## Scaling notes

- v1 desired-count = **1**. `sessionState` lives in-process; ALB stickiness keeps a client on the same task.
- v1.1+: when scaling > 1, move per-connection state to ElastiCache Redis. Look for `TODO(scale)` in `apps/api/src/ws/handler.ts`.
