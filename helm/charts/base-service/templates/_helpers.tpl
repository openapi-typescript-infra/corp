{{- define "base-service.serviceAccountName" -}}
{{- if .Values.serviceAccount.name -}}
  {{- .Values.serviceAccount.name -}}
{{- else if .Values.serviceAccount.create -}}
  {{- printf "%s-k8s-sa" .Values.name -}}
{{- else -}}
  {{- printf "%s-sa" .Values.name -}}
{{- end -}}
{{- end -}}

{{- define "base-service.env-value" -}}
{{- $value := .value -}}
{{- if eq (kindOf $value) "string" -}}
value: {{ tpl $value .root | quote }}
{{- else -}}
valueFrom:
  secretKeyRef:
    name: {{ $value.name | quote }}
    key: {{ default "secret" $value.key | quote }}
{{- end -}}
{{- end -}}

{{- define "base-service.env" -}}
{{- $root := . -}}
{{- range $key, $value := .Values.env }}
- name: {{ $key }}
{{ include "base-service.env-value" (dict "value" $value "root" $root) | indent 2 }}
{{- end -}}
{{- end -}}

{{- define "base-service.worker-env" -}}
{{- $root := . -}}
{{- range $key, $value := .Values.temporal.env }}
- name: {{ $key }}
{{ include "base-service.env-value" (dict "value" $value "root" $root) | indent 2 }}
{{- end -}}
{{- end -}}

{{- define "base-service.replaceall" -}}
{{- $original := .original -}}
{{- $from := .from -}}
{{- $to := .to -}}
{{- $newStr := "" -}}
{{- range $index, $element := (splitList "" $original) -}}
  {{- if eq $element $from -}}
    {{- $newStr = print $newStr $to -}}
  {{- else -}}
    {{- $newStr = print $newStr $element -}}
  {{- end -}}
{{- end -}}
{{- print $newStr -}}
{{- end -}}

{{/*
Transform .Values.name by replacing dashes with underscores and converting to uppercase
*/}}
{{- define "base-service.serviceEnvVarPrefix" }}
{{- $originalName := .Values.name -}}
{{- $replacedName := include "base-service.replaceall" (dict "original" $originalName "from" "-" "to" "_") -}}
{{- $finalName := $replacedName | upper -}}
{{- print $finalName }}
{{- end }}
