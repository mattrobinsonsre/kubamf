# -*- mode: python -*-
# Tiltfile for kubamf
#
# Deploys the kubamf app into the kubamf namespace via Helm chart.
#
# Does NOT conflict with ~/code/bamf Tiltfile:
#   - Different namespace (kubamf vs bamf)
#   - Different images (kubamf vs bamf-*)
#   - Different ports (3001 vs bamf.local:443)

# Safety: only allow local k8s contexts (same list as bamf)
allow_k8s_contexts([
    'rancher-desktop',
    'minikube',
    'docker-desktop',
    'kind-kind',
    'colima',
    'orbstack',
])

# ---------------------------------------------------------------------------
# Namespace
# ---------------------------------------------------------------------------
local_resource(
    'setup-namespace',
    cmd='kubectl create namespace kubamf --dry-run=client -o yaml | kubectl apply -f -',
    labels=['setup'],
)

# ---------------------------------------------------------------------------
# Kubamf App
# ---------------------------------------------------------------------------
docker_build(
    'ghcr.io/kubamf/kubamf',
    '.',
    dockerfile='Dockerfile',
    ignore=['charts/', '.github/', 'tests/', '*.md'],
)

k8s_yaml(helm(
    'charts/kubamf',
    name='kubamf',
    namespace='kubamf',
    set=[
        'image.pullPolicy=Never',
        'image.tag=latest',
        'networkPolicy.enabled=false',
    ],
))

k8s_resource(
    'kubamf',
    port_forwards=['3001:3001'],
    labels=['app'],
    resource_deps=['setup-namespace'],
)
