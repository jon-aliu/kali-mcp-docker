<!-- 
  Part of: Kali MCP Docker Documentation Suite
  AI Agent Note: Copy build.yml and deploy.yml into .github/workflows/ verbatim — do not modify env var names.
-->

# 11 — GitHub Actions CI/CD

## Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `GHCR_TOKEN` | GitHub Personal Access Token with `write:packages` scope |
| `KUBE_CONFIG` | Base64-encoded kubeconfig for the target cluster (optional, for direct kubectl deploy) |

GitHub Actions automatically provides `GITHUB_TOKEN` with `read:packages` for image pulls.

---

## `.github/workflows/build.yml`

```yaml
# .github/workflows/build.yml
# Triggered on every push to main.
# Builds three Docker images in a matrix, pushes to ghcr.io,
# then runs a Trivy vulnerability scan on each image.

name: Build and Push

on:
  push:
    branches:
      - main

env:
  REGISTRY: ghcr.io
  OWNER:    ${{ github.repository_owner }}

jobs:
  build:
    name: Build ${{ matrix.service }}
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
      security-events: write

    strategy:
      matrix:
        include:
          - service:    kali-sidecar
            context:    ./kali/sidecar
            dockerfile: ./kali/sidecar/Dockerfile
          - service:    mcp-server
            context:    ./mcp-server
            dockerfile: ./mcp-server/Dockerfile
          - service:    frontend
            context:    ./frontend
            dockerfile: ./frontend/Dockerfile

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata (tags + labels)
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.OWNER }}/kali-mcp-docker/${{ matrix.service }}
          tags: |
            type=raw,value=latest
            type=sha,prefix=sha-

      - name: Build and push ${{ matrix.service }}
        id: build
        uses: docker/build-push-action@v5
        with:
          context:    ${{ matrix.context }}
          file:       ${{ matrix.dockerfile }}
          push:       true
          tags:       ${{ steps.meta.outputs.tags }}
          labels:     ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to:   type=gha,mode=max

      - name: Run Trivy vulnerability scan
        uses: aquasecurity/trivy-action@master
        with:
          image-ref:      ${{ env.REGISTRY }}/${{ env.OWNER }}/kali-mcp-docker/${{ matrix.service }}:latest
          format:         sarif
          output:         trivy-${{ matrix.service }}.sarif
          severity:       CRITICAL,HIGH
          ignore-unfixed: true

      - name: Upload Trivy scan results to GitHub Security
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: trivy-${{ matrix.service }}.sarif
          category:   trivy-${{ matrix.service }}
```

---

## `.github/workflows/deploy.yml`

```yaml
# .github/workflows/deploy.yml
# Triggered after the build workflow completes successfully on main.
# Updates image tags in k8s/ manifests and commits the change.
# ArgoCD detects the commit and syncs the cluster automatically.

name: Update Deployment Manifests

on:
  workflow_run:
    workflows:
      - "Build and Push"
    branches:
      - main
    types:
      - completed

jobs:
  update-manifests:
    name: Update k8s image tags
    runs-on: ubuntu-latest
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    permissions:
      contents: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Get short SHA
        id: sha
        run: echo "SHORT_SHA=$(echo ${{ github.sha }} | cut -c1-7)" >> $GITHUB_OUTPUT

      - name: Update kali-sidecar image tag
        run: |
          sed -i "s|ghcr.io/${{ github.repository_owner }}/kali-mcp-docker/kali-sidecar:sha-.*|ghcr.io/${{ github.repository_owner }}/kali-mcp-docker/kali-sidecar:sha-${{ steps.sha.outputs.SHORT_SHA }}|g" \
            k8s/kali-sidecar/deployment.yaml

      - name: Update mcp-server image tag
        run: |
          sed -i "s|ghcr.io/${{ github.repository_owner }}/kali-mcp-docker/mcp-server:sha-.*|ghcr.io/${{ github.repository_owner }}/kali-mcp-docker/mcp-server:sha-${{ steps.sha.outputs.SHORT_SHA }}|g" \
            k8s/mcp-server/deployment.yaml

      - name: Update frontend image tag
        run: |
          sed -i "s|ghcr.io/${{ github.repository_owner }}/kali-mcp-docker/frontend:sha-.*|ghcr.io/${{ github.repository_owner }}/kali-mcp-docker/frontend:sha-${{ steps.sha.outputs.SHORT_SHA }}|g" \
            k8s/frontend/deployment.yaml

      - name: Commit and push updated manifests
        run: |
          git config user.name  "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add k8s/
          git diff --staged --quiet || git commit -m "ci: update image tags to sha-${{ steps.sha.outputs.SHORT_SHA }} [skip ci]"
          git push
```

---

## How It Works

```
1. Developer pushes to main branch.

2. build.yml triggers in parallel for all 3 services (matrix strategy):
   - Checks out code
   - Builds Docker image with Buildx (uses GitHub Actions cache)
   - Pushes to ghcr.io with :latest and :sha-<short-sha> tags
   - Runs Trivy scan → uploads SARIF to GitHub Security tab

3. When build.yml succeeds, deploy.yml triggers:
   - Checks out the repository
   - Uses sed to replace :sha-<old> with :sha-<new> in k8s/ manifests
   - Commits and pushes the updated manifests with [skip ci] tag

4. ArgoCD detects the new commit in k8s/ and syncs the cluster
   (see docs/12-argocd.md for ArgoCD setup).
```
