<!-- 
  Part of: Kali MCP Docker Documentation Suite
  AI Agent Note: Use this file to install ArgoCD and create the Application manifest after Kubernetes is running.
-->

# 12 — ArgoCD GitOps

## What ArgoCD Does in This Project

ArgoCD continuously monitors the `k8s/` directory of the GitHub repository. When the `deploy.yml` GitHub Actions workflow commits updated image tags, ArgoCD detects the diff within seconds and automatically applies the changed manifests to the `kali-mcp` namespace. This closes the GitOps loop: pushing code automatically results in a cluster update without manual `kubectl apply` commands.

---

## The GitOps Loop

```
1. Developer pushes code to main branch on GitHub.

2. GitHub Actions (build.yml) builds Docker images and pushes
   :sha-<short> tags to ghcr.io.

3. GitHub Actions (deploy.yml) updates image tags in k8s/ manifests
   and commits the change to main.

4. ArgoCD polls GitHub (or receives a webhook) and detects the new
   commit in k8s/.

5. ArgoCD compares desired state (Git) with live state (cluster)
   and finds diff in Deployment image fields.

6. ArgoCD applies the changed manifests to the kali-mcp namespace.
   The cluster now runs the new image version.

7. Kubernetes performs a rolling update — old pods are terminated
   only after new pods pass readiness probes.
```

---

## Installation

```bash
# Create the ArgoCD namespace
kubectl create namespace argocd

# Install ArgoCD (stable release)
kubectl apply -n argocd \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Wait for all ArgoCD pods to be running
kubectl wait --for=condition=available --timeout=120s \
  deployment/argocd-server -n argocd
```

---

## Access the ArgoCD UI

```bash
# Port-forward the ArgoCD server
kubectl port-forward svc/argocd-server -n argocd 8080:443

# Then open: https://localhost:8080
# Username: admin
```

### Get the Initial Admin Password

```bash
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d && echo
```

> Reset the password after first login via: `argocd account update-password`

---

## `argocd-app.yaml`

Apply this manifest to register the Kali MCP Docker application with ArgoCD:

```yaml
# argocd-app.yaml
# Apply with: kubectl apply -f argocd-app.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: kali-mcp-docker
  namespace: argocd
  finalizers:
    - resources-finalizer.argocd.argoproj.io
spec:
  project: default

  source:
    repoURL:        https://github.com/jon-aliu/kali-mcp-docker.git
    targetRevision: HEAD
    path:           k8s

  destination:
    server:    https://kubernetes.default.svc
    namespace: kali-mcp

  syncPolicy:
    automated:
      prune:    true   # Delete resources removed from Git
      selfHeal: true   # Re-apply if someone manually changes the cluster
    syncOptions:
      - CreateNamespace=true
      - PrunePropagationPolicy=foreground
      - PruneLast=true
    retry:
      limit: 5
      backoff:
        duration:    5s
        factor:      2
        maxDuration: 3m
```

```bash
kubectl apply -f argocd-app.yaml
```

---

## Verify Sync Status

```bash
# Check application status
kubectl get application kali-mcp-docker -n argocd

# Detailed sync info
kubectl describe application kali-mcp-docker -n argocd

# Using argocd CLI (install: https://argo-cd.readthedocs.io/en/stable/cli_installation/)
argocd app get kali-mcp-docker
argocd app sync kali-mcp-docker  # Manual sync trigger
```
