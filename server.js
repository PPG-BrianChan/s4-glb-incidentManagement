const tracer = require('@sap/xotel-agent-ext-js/dist/common/tracer');

const cds = require('@sap/cds')
// Import necessary modules
const { metrics } = require('@opentelemetry/api');

const meter = metrics.getMeter('@capire/incidents:incidents.urgency.high');
// Create a counter
const counter = meter.createUpDownCounter('incidents.urgency.high');

// Initialization of Exception Monitoring:
const sdklogs = require ('@opentelemetry/sdk-logs');
const calmExtAutoConf = require('@sap/xotel-agent-ext-js/dist/config/AutoInstrumentationConfig');
const cflog = require("cf-nodejs-logging-support");
const otellog = require('@sap/opentelemetry-exporter-for-sap-cloud-logging');

// Create an instance of the OpenTelemetryLogsOutputPlugin.
// By default, it will use the global logger provider.
// Use a custom loggerProvider to capture Cloud Foundry attributes.
const cfLoggerProvider = new sdklogs.LoggerProvider({resource: new otellog.CFApplicationDetector().detect()});
const otelOutputPlugin = new cflog.OpenTelemetryLogsOutputPlugin(cfLoggerProvider)

// Optionally set whether additional log fields should be included as log attributes.
// Default: include custom fields only.
otelOutputPlugin.setIncludeFieldsAsAttributes(cflog.FieldInclusionMode.CustomFieldsOnly)

// register the plugin
cflog.addOutputPlugin(otelOutputPlugin)

// add CALM Extension Exception Monitoring log processor
cfLoggerProvider.addLogRecordProcessor(calmExtAutoConf.createEXMLogRecordProcessor());

cds.on('served', async () => {
    const { ProcessorService } = cds.services
    // Increase count when new incident with high urgency is created
    ProcessorService.after("CREATE", "Incidents", (results, req) => {
        if (results.urgency_code === "H" && results.status_code !== "C") {
            counter.add(1, { 'sap.tenancy.tenant_id': req.tenant });
        }
    });
    // Reduce count once incident is closed
    ProcessorService.after("UPDATE", "Incidents", (results, req) => {
        if (results.urgency_code === "H" && results?.status_code === "C") {
            counter.add(-1, { 'sap.tenancy.tenant_id': req.tenant });
        }
    });
});
module.exports = cds.server
