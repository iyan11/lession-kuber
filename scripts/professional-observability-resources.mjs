import {docs,ns,meta,safe,resources,deploy,service,pvc,cm,config,volume,mount,web,empty} from './professional-resources.mjs';
const storage=(name,container,configName,path='/etc/learning')=>[pvc(name,'1Gi'),deploy(name,{...container,securityContext:safe,resources:{requests:{cpu:'100m',memory:'128Mi'},limits:{cpu:'1',memory:'512Mi'}},volumeMounts:[mount('config',path,true),mount('data','/data')]},{volumes:[config('config',configName),volume('data',name)]})];
docs.loki=[cm('deep-loki',{'loki.yaml':`auth_enabled: false
server:
  http_listen_port: 3100
common:
  path_prefix: /data
  replication_factor: 1
  ring:
    kvstore:
      store: inmemory
  storage:
    filesystem:
      chunks_directory: /data/chunks
      rules_directory: /data/rules
schema_config:
  configs:
    - from: 2024-01-01
      store: tsdb
      object_store: filesystem
      schema: v13
      index:
        prefix: index_
        period: 24h
limits_config:
  allow_structured_metadata: true
  ingestion_rate_mb: 1
  ingestion_burst_size_mb: 2
compactor:
  working_directory: /data/compactor
`}),...storage('deep-loki',{name:'loki',image:'grafana/loki:3.7.9',args:['-config.file=/etc/learning/loki.yaml'],ports:[{containerPort:3100}]},'deep-loki'),service('deep-loki',3100)];
const prometheusConfig=`global:
  scrape_interval: 10s
  evaluation_interval: 10s
rule_files:
  - /etc/learning/rules.yaml
scrape_configs:
  - job_name: learning-web
    static_configs:
      - targets: ['deep-web:3000']
alerting:
  alertmanagers:
    - static_configs:
        - targets: ['deep-alertmanager:9093']
`;
docs.prometheus=[cm('deep-prometheus',{'prometheus.yaml':prometheusConfig,'rules.yaml':`groups:
  - name: learning
    rules:
      - alert: LearningErrors
        expr: increase(kubelab_errors_total[2m]) > 2
        for: 10s
        labels:
          severity: learning
        annotations:
          summary: Fictional requests produced errors
`}),...storage('deep-prometheus',{name:'prometheus',image:'prom/prometheus:v3.15.1',args:['--config.file=/etc/learning/prometheus.yaml','--storage.tsdb.path=/data','--storage.tsdb.retention.time=2h','--storage.tsdb.retention.size=300MB'],ports:[{containerPort:9090}]},'deep-prometheus'),service('deep-prometheus',9090)];
docs.alerts=[cm('deep-alertmanager',{'alertmanager.yaml':`global: {}
route:
  receiver: learning-sink
  group_by: [alertname]
  group_wait: 5s
  group_interval: 30s
  repeat_interval: 1h
receivers:
  - name: learning-sink
`}),...storage('deep-alertmanager',{name:'alertmanager',image:'prom/alertmanager:v0.28.1',args:['--config.file=/etc/learning/alertmanager.yaml','--storage.path=/data'],ports:[{containerPort:9093}]},'deep-alertmanager'),service('deep-alertmanager',9093)];
docs.federation=[cm('deep-global',{'prometheus.yaml':`global:
  scrape_interval: 15s
scrape_configs:
  - job_name: federation
    honor_labels: true
    metrics_path: /federate
    params:
      'match[]': ['{__name__=~"kubelab_.*"}']
    static_configs:
      - targets: ['deep-prometheus:9090']
`}),...storage('deep-global',{name:'prometheus',image:'prom/prometheus:v3.15.1',args:['--config.file=/etc/learning/prometheus.yaml','--storage.tsdb.path=/data','--storage.tsdb.retention.time=2h','--storage.tsdb.retention.size=200MB'],ports:[{containerPort:9090}]},'deep-global'),service('deep-global',9090)];
docs.tracing=[cm('deep-collector',{'collector.yaml':`receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318
processors:
  memory_limiter:
    check_interval: 1s
    limit_mib: 128
  batch:
    timeout: 1s
exporters:
  otlphttp:
    endpoint: http://deep-tempo:4318
service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlphttp]
`}),cm('deep-tempo',{'tempo.yaml':`server:
  http_listen_port: 3200
distributor:
  receivers:
    otlp:
      protocols:
        http:
          endpoint: 0.0.0.0:4318
storage:
  trace:
    backend: local
    wal:
      path: /data/wal
    local:
      path: /data/traces
compactor:
  compaction:
    block_retention: 1h
`}),...storage('deep-tempo',{name:'tempo',image:'grafana/tempo:2.9.0',args:['-config.file=/etc/learning/tempo.yaml'],ports:[{containerPort:3200},{containerPort:4318}]},'deep-tempo'),{...service('deep-tempo',3200),spec:{selector:{app:'deep-tempo'},ports:[{name:'query',port:3200},{name:'otlp',port:4318}]}},deploy('deep-collector',{name:'collector',image:'ghcr.io/open-telemetry/opentelemetry-collector-releases/opentelemetry-collector:0.164.0',args:['--config=/etc/learning/collector.yaml'],securityContext:safe,resources,ports:[{containerPort:4318}],volumeMounts:[mount('config','/etc/learning',true)]},{volumes:[config('config','deep-collector')]}),service('deep-collector',4318),...['backend','frontend'].flatMap(role=>[deploy('deep-'+role,web('web','labs/telemetry/app.mjs',{env:[{name:'LAB_ROLE',value:role},{name:'OTLP_ENDPOINT',value:'http://deep-collector:4318/v1/traces'},...(role==='frontend'?[{name:'BACKEND_URL',value:'http://deep-backend:3000'}]:[])]})),service('deep-'+role)])];
docs.grafana=[cm('deep-grafana',{'datasources.yaml':`apiVersion: 1
datasources:
  - name: Learning metrics
    type: prometheus
    uid: learning-metrics
    access: proxy
    url: http://deep-prometheus:9090
  - name: Learning traces
    type: tempo
    uid: learning-traces
    access: proxy
    url: http://deep-tempo:3200
  - name: Learning logs
    type: loki
    uid: learning-logs
    access: proxy
    url: http://deep-loki:3100
`}),pvc('deep-grafana','512Mi'),deploy('deep-grafana',{name:'grafana',image:'grafana/grafana:13.3.0',ports:[{containerPort:3000}],env:[{name:'GF_AUTH_ANONYMOUS_ENABLED',value:'true'},{name:'GF_AUTH_ANONYMOUS_ORG_ROLE',value:'Viewer'},{name:'GF_AUTH_DISABLE_LOGIN_FORM',value:'true'},{name:'GF_PATHS_DATA',value:'/data'},{name:'GF_PATHS_LOGS',value:'/tmp/logs'},{name:'GF_PATHS_PLUGINS',value:'/data/plugins'}],resources,securityContext:safe,volumeMounts:[mount('data','/data'),mount('tmp','/tmp'),mount('provision','/etc/grafana/provisioning/datasources',true)]},{volumes:[volume('data','deep-grafana'),empty('tmp'),config('provision','deep-grafana')]}),service('deep-grafana')];
for(const [set,name,path,port] of [['loki','deep-loki','/ready',3100],['prometheus','deep-prometheus','/-/ready',9090],['alerts','deep-alertmanager','/-/ready',9093],['federation','deep-global','/-/ready',9090],['tracing','deep-tempo','/ready',3200],['grafana','deep-grafana','/api/health',3000]]){
 const container=docs[set].find(x=>x.kind==='Deployment'&&x.metadata.name===name).spec.template.spec.containers[0];container.readinessProbe={httpGet:{path,port},periodSeconds:3,timeoutSeconds:2};
}
for(const name of ['deep-frontend','deep-backend'])docs.tracing.find(x=>x.kind==='Deployment'&&x.metadata.name===name).spec.template.spec.containers[0].readinessProbe={httpGet:{path:'/readyz',port:3000},periodSeconds:2};
docs.tracing.find(x=>x.kind==='Deployment'&&x.metadata.name==='deep-collector').spec.template.spec.containers[0].readinessProbe={tcpSocket:{port:4318},periodSeconds:2};
