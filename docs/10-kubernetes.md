<!-- 
  Part of: Kali MCP Docker Documentation Suite
  AI Agent Note: Create every YAML block in this file as a file under k8s/ — the path is shown in each code block header comment.
-->

# 10 — Kubernetes

## Deployment Commands

```bash
# 1. Apply namespace first
kubectl apply -f k8s/namespace.yaml

# 2. Apply secrets and config (replace base64 values in secrets.yaml first)
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/configmap.yaml

# 3. Apply storage
kubectl apply -f k8s/postgres/pvc.yaml

# 4. Apply all services and deployments
kubectl apply -f k8s/postgres/
kubectl apply -f k8s/redis/
kubectl apply -f k8s/kali/
kubectl apply -f k8s/kali-sidecar/
kubectl apply -f k8s/mcp-server/
kubectl apply -f k8s/frontend/

# 5. Apply ingress and network policy
kubectl apply -f k8s/ingress/
kubectl apply -f k8s/networkpolicy.yaml

# 6. Watch pods come up
kubectl get pods -n kali-mcp -w
```

---

## `k8s/namespace.yaml`

```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: kali-mcp
  labels:
    app.kubernetes.io/part-of: kali-mcp-docker
```

---

## `k8s/configmap.yaml`

```yaml
# k8s/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: kali-mcp-config
  namespace: kali-mcp
data:
  POSTGRES_DB:      "kalimcp"
  POSTGRES_USER:    "kalimcp"
  REDIS_HOST:       "redis-svc"
  REDIS_PORT:       "6379"
  OLLAMA_HOST:      "http://ollama-svc:11434"
  KALI_SIDECAR_URL: "http://kali-sidecar-svc:5000"
  APP_ENV:          "production"
  OPENAI_MODEL:     "gpt-4o"
  OLLAMA_MODEL:     "llama3"
```

---

## `k8s/secrets.yaml`

```yaml
# k8s/secrets.yaml
# Replace placeholder values with: echo -n 'yourvalue' | base64
apiVersion: v1
kind: Secret
metadata:
  name: kali-mcp-secrets
  namespace: kali-mcp
type: Opaque
data:
  # echo -n 'supersecretpassword' | base64
  POSTGRES_PASSWORD: c3VwZXJzZWNyZXRwYXNzd29yZA==
  # echo -n 'redispassword' | base64
  REDIS_PASSWORD: cmVkaXNwYXNzd29yZA==
  # echo -n 'your-openai-api-key' | base64
  OPENAI_API_KEY: eW91ci1vcGVuYWktYXBpLWtleQ==
  # echo -n 'your-32-char-jwt-secret-here!!!!!' | base64
  JWT_SECRET: eW91ci0zMi1jaGFyLWp3dC1zZWNyZXQtaGVyZSEhISEh
```

---

## `k8s/postgres/pvc.yaml`

```yaml
# k8s/postgres/pvc.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-pvc
  namespace: kali-mcp
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
```

---

## `k8s/postgres/statefulset.yaml`

```yaml
# k8s/postgres/statefulset.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: kali-mcp
spec:
  serviceName: postgres-svc
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
        - name: postgres
          image: postgres:16-alpine
          ports:
            - containerPort: 5432
          env:
            - name: POSTGRES_DB
              valueFrom:
                configMapKeyRef:
                  name: kali-mcp-config
                  key: POSTGRES_DB
            - name: POSTGRES_USER
              valueFrom:
                configMapKeyRef:
                  name: kali-mcp-config
                  key: POSTGRES_USER
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: kali-mcp-secrets
                  key: POSTGRES_PASSWORD
          volumeMounts:
            - name: postgres-storage
              mountPath: /var/lib/postgresql/data
          livenessProbe:
            exec:
              command: ["pg_isready", "-U", "kalimcp"]
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            exec:
              command: ["pg_isready", "-U", "kalimcp"]
            initialDelaySeconds: 5
            periodSeconds: 5
      volumes:
        - name: postgres-storage
          persistentVolumeClaim:
            claimName: postgres-pvc
```

---

## `k8s/postgres/service.yaml`

```yaml
# k8s/postgres/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: postgres-svc
  namespace: kali-mcp
spec:
  selector:
    app: postgres
  ports:
    - port: 5432
      targetPort: 5432
  type: ClusterIP
```

---

## `k8s/redis/deployment.yaml`

```yaml
# k8s/redis/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis
  namespace: kali-mcp
spec:
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
        - name: redis
          image: redis:7-alpine
          command:
            - redis-server
            - --requirepass
            - $(REDIS_PASSWORD)
          env:
            - name: REDIS_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: kali-mcp-secrets
                  key: REDIS_PASSWORD
          ports:
            - containerPort: 6379
          livenessProbe:
            exec:
              command: ["redis-cli", "-a", "$(REDIS_PASSWORD)", "ping"]
            initialDelaySeconds: 15
            periodSeconds: 10
```

---

## `k8s/redis/service.yaml`

```yaml
# k8s/redis/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: redis-svc
  namespace: kali-mcp
spec:
  selector:
    app: redis
  ports:
    - port: 6379
      targetPort: 6379
  type: ClusterIP
```

---

## `k8s/kali/deployment.yaml`

```yaml
# k8s/kali/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kali
  namespace: kali-mcp
spec:
  replicas: 1
  selector:
    matchLabels:
      app: kali
  template:
    metadata:
      labels:
        app: kali
    spec:
      securityContext:
        runAsUser: 1001
        runAsGroup: 1001
      containers:
        - name: kali
          image: ghcr.io/jon-aliu/kali-mcp-docker/kali:latest
          resources:
            requests:
              memory: "512Mi"
              cpu:    "250m"
            limits:
              memory: "2Gi"
              cpu:    "1000m"
          securityContext:
            capabilities:
              add:
                - NET_ADMIN
                - NET_RAW
                - NET_BIND_SERVICE
              drop:
                - ALL
          volumeMounts:
            - name: kali-results
              mountPath: /home/kaliuser/results
      volumes:
        - name: kali-results
          emptyDir: {}
```

---

## `k8s/kali/service.yaml`

```yaml
# k8s/kali/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: kali-svc
  namespace: kali-mcp
spec:
  selector:
    app: kali
  ports:
    - port: 80
      targetPort: 80
  type: ClusterIP
```

---

## `k8s/kali-sidecar/deployment.yaml`

```yaml
# k8s/kali-sidecar/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kali-sidecar
  namespace: kali-mcp
spec:
  replicas: 1
  selector:
    matchLabels:
      app: kali-sidecar
  template:
    metadata:
      labels:
        app: kali-sidecar
    spec:
      containers:
        - name: kali-sidecar
          image: ghcr.io/jon-aliu/kali-mcp-docker/kali-sidecar:latest
          ports:
            - containerPort: 5000
          livenessProbe:
            httpGet:
              path: /health
              port: 5000
            initialDelaySeconds: 10
            periodSeconds: 15
          readinessProbe:
            httpGet:
              path: /health
              port: 5000
            initialDelaySeconds: 5
            periodSeconds: 10
          resources:
            requests:
              memory: "128Mi"
              cpu:    "100m"
            limits:
              memory: "512Mi"
              cpu:    "500m"
```

---

## `k8s/kali-sidecar/service.yaml`

```yaml
# k8s/kali-sidecar/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: kali-sidecar-svc
  namespace: kali-mcp
spec:
  selector:
    app: kali-sidecar
  ports:
    - port: 5000
      targetPort: 5000
  type: ClusterIP
```

---

## `k8s/mcp-server/deployment.yaml`

```yaml
# k8s/mcp-server/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mcp-server
  namespace: kali-mcp
spec:
  replicas: 2
  selector:
    matchLabels:
      app: mcp-server
  template:
    metadata:
      labels:
        app: mcp-server
    spec:
      containers:
        - name: mcp-server
          image: ghcr.io/jon-aliu/kali-mcp-docker/mcp-server:latest
          ports:
            - containerPort: 8000
          envFrom:
            - configMapRef:
                name: kali-mcp-config
            - secretRef:
                name: kali-mcp-secrets
          env:
            - name: POSTGRES_DSN
              value: "postgresql+asyncpg://kalimcp:$(POSTGRES_PASSWORD)@postgres-svc:5432/kalimcp"
            - name: REDIS_URL
              value: "redis://:$(REDIS_PASSWORD)@redis-svc:6379/0"
          livenessProbe:
            httpGet:
              path: /health
              port: 8000
            initialDelaySeconds: 20
            periodSeconds: 15
          readinessProbe:
            httpGet:
              path: /health
              port: 8000
            initialDelaySeconds: 10
            periodSeconds: 10
          resources:
            requests:
              memory: "256Mi"
              cpu:    "250m"
            limits:
              memory: "1Gi"
              cpu:    "1000m"
```

---

## `k8s/mcp-server/service.yaml`

```yaml
# k8s/mcp-server/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: mcp-server-svc
  namespace: kali-mcp
spec:
  selector:
    app: mcp-server
  ports:
    - port: 8000
      targetPort: 8000
  type: ClusterIP
```

---

## `k8s/mcp-server/hpa.yaml`

```yaml
# k8s/mcp-server/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: mcp-server-hpa
  namespace: kali-mcp
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: mcp-server
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

---

## `k8s/frontend/deployment.yaml`

```yaml
# k8s/frontend/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
  namespace: kali-mcp
spec:
  replicas: 2
  selector:
    matchLabels:
      app: frontend
  template:
    metadata:
      labels:
        app: frontend
    spec:
      containers:
        - name: frontend
          image: ghcr.io/jon-aliu/kali-mcp-docker/frontend:latest
          ports:
            - containerPort: 3000
          livenessProbe:
            httpGet:
              path: /
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 15
          resources:
            requests:
              memory: "128Mi"
              cpu:    "100m"
            limits:
              memory: "512Mi"
              cpu:    "500m"
```

---

## `k8s/frontend/service.yaml`

```yaml
# k8s/frontend/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: frontend-svc
  namespace: kali-mcp
spec:
  selector:
    app: frontend
  ports:
    - port: 3000
      targetPort: 3000
  type: ClusterIP
```

---

## `k8s/ingress/ingress.yaml`

```yaml
# k8s/ingress/ingress.yaml
# Requires: kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: kali-mcp-ingress
  namespace: kali-mcp
  annotations:
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
    # Disable buffering for SSE streaming
    nginx.ingress.kubernetes.io/proxy-buffering: "off"
    # Enable WebSocket proxying
    nginx.ingress.kubernetes.io/proxy-http-version: "1.1"
    nginx.ingress.kubernetes.io/configuration-snippet: |
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
spec:
  ingressClassName: nginx
  rules:
    - host: kali-mcp.local
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: mcp-server-svc
                port:
                  number: 8000
          - path: /
            pathType: Prefix
            backend:
              service:
                name: frontend-svc
                port:
                  number: 3000
```

---

## `k8s/networkpolicy.yaml`

```yaml
# k8s/networkpolicy.yaml
# Deny all egress from the kali pod except to kali-sidecar on port 5000
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: kali-egress-restrict
  namespace: kali-mcp
spec:
  podSelector:
    matchLabels:
      app: kali
  policyTypes:
    - Egress
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: kali-sidecar
      ports:
        - protocol: TCP
          port: 5000
```
