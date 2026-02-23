{{/*
Expand the name of the chart.
*/}}
{{- define "kubamf.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "kubamf.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "kubamf.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "kubamf.labels" -}}
helm.sh/chart: {{ include "kubamf.chart" . }}
{{ include "kubamf.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "kubamf.selectorLabels" -}}
app.kubernetes.io/name: {{ include "kubamf.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: kubamf
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "kubamf.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "kubamf.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Resolve container image, respecting global.image.registry from parent chart
*/}}
{{- define "kubamf.image" -}}
{{- $tag := .Values.image.tag | default .Chart.AppVersion }}
{{- if and .Values.global .Values.global.image .Values.global.image.registry }}
{{- printf "%s/%s:%s" .Values.global.image.registry .Values.image.repository $tag }}
{{- else }}
{{- printf "%s:%s" .Values.image.repository $tag }}
{{- end }}
{{- end }}
