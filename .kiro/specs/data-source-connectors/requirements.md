# Requirements Document

## Introduction

This feature introduces a comprehensive data source connector architecture and advanced visualization capabilities to the Data Viz application, inspired by Tableau's April 2026 release. The system enables users to connect to cloud data warehouses, relational databases, NoSQL databases, cloud services, file/cloud storage, REST APIs, and connectivity protocols. Additionally, it incorporates Tableau Next-era features including Sankey charts, AI-assisted insights, parameter actions, groups/bins, percent-of-total calculations, and enhanced interactivity. Since the application is a client-side Next.js app, database and warehouse connections require a lightweight backend proxy service to securely manage credentials and execute queries on behalf of the client.

## Glossary

- **Connector_Registry**: The module that maintains the catalog of all available data source connector definitions, their metadata, categories, and configuration schemas.
- **Connector_Engine**: The orchestration layer responsible for instantiating connectors, managing connection lifecycle (connect, query, disconnect), and routing data to the Data Viz workspace.
- **Connection_Form**: The dynamic UI component that renders connector-specific configuration fields (host, port, credentials, database name, etc.) based on the connector schema.
- **Connector_Proxy**: The backend service that securely holds credentials, establishes connections to external data sources, executes queries, and streams results back to the client.
- **Connector_Definition**: A declarative schema describing a single connector's metadata (name, category, icon, description) and its required/optional configuration parameters.
- **Connection_Profile**: A saved set of connection parameters for a specific data source, allowing users to reconnect without re-entering credentials.
- **Data_Preview**: A limited result set (first N rows) fetched from a connected data source to allow users to verify the connection and inspect the schema before full import.
- **Schema_Browser**: The UI component that displays the tables, views, and columns available in a connected database or warehouse, allowing users to select which data to import.
- **Query_Builder**: The component that allows users to write or visually construct queries (SQL or connector-specific) to extract data from a connected source.
- **File_Connector**: A connector type that handles local file uploads and cloud storage file imports (Excel, PDF, text, statistical files) directly in the browser without requiring the Connector_Proxy.
- **Cloud_Storage_Connector**: A connector type that authenticates with cloud storage providers (Google Drive, OneDrive, Dropbox, Box) via OAuth and lists/imports files from the user's storage.
- **REST_API_Connector**: A connector that allows users to connect to any REST API endpoint by configuring URL, headers, authentication, and pagination without writing code.
- **Parameter_Action**: A dashboard interaction that updates a parameter value when a user clicks or selects a mark in a visualization, enabling dynamic what-if scenarios.
- **Dashboard_Narrative**: An AI-generated text summary that describes key insights, trends, and anomalies visible in a dashboard or individual visualization.

## Requirements

### Requirement 1: Connector Registry and Catalog

**User Story:** As a data analyst, I want to browse all available data source connectors organized by category, so that I can quickly find and select the connector I need.

#### Acceptance Criteria

1. THE Connector_Registry SHALL provide a catalog of all supported connectors grouped into categories: Cloud Data Warehouses, Databases, Cloud Services, File/Cloud Storage, REST APIs, and Connectivity Protocols.
2. WHEN a user opens the data source connection dialog, THE Connector_Registry SHALL display all available connectors with their name, icon, category, and brief description.
3. WHEN a user types in the connector search field, THE Connector_Registry SHALL filter the displayed connectors to show only those whose name or category matches the search query.
4. THE Connector_Registry SHALL include connector definitions for: Amazon Athena, Amazon Aurora, Amazon EMR Hadoop Hive, Amazon Redshift, Amazon S3, Alibaba AnalyticsDB, Alibaba Data Lake Analytics, Alibaba MaxCompute, Databricks, Google Cloud SQL, Google Looker, Microsoft Azure Data Lake Gen 2, Microsoft Azure Synapse, Snowflake, Qubole Presto, PostgreSQL, MySQL, Microsoft SQL Server, Oracle, MariaDB, IBM DB2, IBM Netezza, MongoDB, ClickHouse, SAP HANA, SAP Sybase IQ, SAP Sybase ASE, Teradata, HP Vertica, Exasol, Pivotal Greenplum, MonetDB, SingleStore, Microsoft Access, Kognitio, Kyvos, MarkLogic, Presto, SparkSQL, Salesforce, Salesforce Data Cloud, Salesforce Datorama, Salesforce Marketing Cloud, Oracle Netsuite, Splunk, Box, Dropbox, Google Drive, OneDrive, Microsoft Excel, PDF, Text files, Statistical files, REST API, JDBC, ODBC, Apache Drill, Cloudera Hadoop, Cloudera Impala, Hortonworks Hadoop Hive, MapR Hadoop Hive, IBM BigInsights, Denodo.
5. WHEN a user selects a connector from the catalog, THE Connector_Engine SHALL display the Connection_Form with the appropriate configuration fields for that connector.

### Requirement 2: Dynamic Connection Form

**User Story:** As a data analyst, I want to see a connection form tailored to the specific data source I selected, so that I can provide the correct parameters to establish a connection.

#### Acceptance Criteria

1. WHEN a connector is selected, THE Connection_Form SHALL render input fields based on the Connector_Definition schema, including required fields (host, port, database, authentication method) and optional fields (SSL mode, connection timeout, custom properties).
2. THE Connection_Form SHALL validate all required fields before allowing the user to attempt a connection.
3. WHEN a user submits invalid input, THE Connection_Form SHALL display field-level validation errors describing the issue.
4. THE Connection_Form SHALL support multiple authentication methods per connector (username/password, OAuth 2.0, API key, service account JSON, IAM role) as defined by the Connector_Definition.
5. WHEN a connector requires OAuth 2.0 authentication, THE Connection_Form SHALL initiate the OAuth flow in a popup window and capture the resulting access token.
6. THE Connection_Form SHALL mask password and secret fields by default and provide a toggle to reveal them.

### Requirement 3: Connection Lifecycle Management

**User Story:** As a data analyst, I want to test my connection before importing data, so that I can verify my credentials and network access are correct.

#### Acceptance Criteria

1. WHEN a user clicks the "Test Connection" button, THE Connector_Engine SHALL attempt to establish a connection to the data source using the provided parameters and report success or failure within 30 seconds.
2. IF a connection test fails, THEN THE Connector_Engine SHALL display a descriptive error message indicating the failure reason (authentication failure, network unreachable, invalid database name, timeout).
3. WHEN a connection is successfully established, THE Connector_Engine SHALL transition the UI to the Schema_Browser view.
4. WHILE a connection attempt is in progress, THE Connection_Form SHALL display a loading indicator and disable the submit button to prevent duplicate requests.
5. IF a connection remains idle for more than 10 minutes, THEN THE Connector_Engine SHALL close the connection and notify the user that reconnection is required.

### Requirement 4: Schema Browser and Table Selection

**User Story:** As a data analyst, I want to browse the tables and columns available in my connected database, so that I can select the specific data I want to analyze.

#### Acceptance Criteria

1. WHEN a connection is established to a database or warehouse connector, THE Schema_Browser SHALL display a tree view of available schemas, tables, and views.
2. WHEN a user expands a table node in the Schema_Browser, THE Schema_Browser SHALL display the column names and data types for that table.
3. WHEN a user selects one or more tables, THE Schema_Browser SHALL enable the "Import" and "Custom Query" actions.
4. THE Schema_Browser SHALL support searching tables and columns by name within the connected schema.
5. WHEN a user selects a table, THE Data_Preview SHALL fetch and display the first 100 rows of that table.

### Requirement 5: Query Builder and Custom SQL

**User Story:** As a data analyst, I want to write custom SQL queries against my connected data source, so that I can extract exactly the data I need for analysis.

#### Acceptance Criteria

1. WHEN a user selects the "Custom Query" option, THE Query_Builder SHALL display a text editor with SQL syntax highlighting.
2. WHEN a user executes a query, THE Connector_Proxy SHALL run the query against the connected data source and return the result set to the client.
3. IF a query execution fails, THEN THE Query_Builder SHALL display the error message returned by the data source.
4. THE Query_Builder SHALL limit result sets to 1,000,000 rows to prevent memory exhaustion on the client.
5. WHEN a query returns results, THE Data_Preview SHALL display the first 100 rows and the total row count.
6. THE Query_Builder SHALL support parameterized queries to prevent SQL injection when user-provided values are included.

### Requirement 6: Connector Proxy Backend Service

**User Story:** As a system administrator, I want database credentials to be handled securely on the server side, so that sensitive connection details are never exposed to the client browser.

#### Acceptance Criteria

1. THE Connector_Proxy SHALL accept connection requests from the client containing connection parameters and execute queries on behalf of the client.
2. THE Connector_Proxy SHALL encrypt stored credentials at rest using AES-256 encryption.
3. THE Connector_Proxy SHALL validate all incoming requests with an authenticated session token before executing any database operation.
4. IF the Connector_Proxy receives a malformed or unauthorized request, THEN THE Connector_Proxy SHALL return a 401 or 400 HTTP status code with a generic error message.
5. THE Connector_Proxy SHALL enforce query timeout limits of 120 seconds per query execution.
6. THE Connector_Proxy SHALL sanitize all query parameters to prevent SQL injection attacks.
7. THE Connector_Proxy SHALL support connection pooling with a maximum of 10 concurrent connections per user session.

### Requirement 7: Connection Profile Management

**User Story:** As a data analyst, I want to save my connection configurations, so that I can reconnect to frequently used data sources without re-entering credentials.

#### Acceptance Criteria

1. WHEN a user successfully connects to a data source, THE Connector_Engine SHALL offer to save the connection as a Connection_Profile.
2. THE Connector_Engine SHALL store Connection_Profiles with an encrypted copy of the credentials.
3. WHEN a user selects a saved Connection_Profile, THE Connector_Engine SHALL pre-populate the Connection_Form with the saved parameters.
4. THE Connector_Engine SHALL allow users to rename, duplicate, and delete saved Connection_Profiles.
5. WHEN a user deletes a Connection_Profile, THE Connector_Engine SHALL permanently remove the stored credentials.

### Requirement 8: File and Cloud Storage Connectors

**User Story:** As a data analyst, I want to import data from local files (Excel, PDF, text, statistical files) and cloud storage (Google Drive, OneDrive, Dropbox, Box, Amazon S3), so that I can analyze data from diverse file-based sources.

#### Acceptance Criteria

1. WHEN a user selects a file connector (Excel, PDF, Text, Statistical files), THE File_Connector SHALL process the file entirely in the browser without sending data to the Connector_Proxy.
2. THE File_Connector SHALL support Microsoft Excel files (.xlsx, .xls) and parse all sheets, allowing the user to select which sheet to import.
3. THE File_Connector SHALL support delimited text files (.csv, .tsv, .txt) with configurable delimiter, quote character, and encoding options.
4. THE File_Connector SHALL support PDF files by extracting tabular data from PDF tables.
5. THE File_Connector SHALL support statistical file formats (.sav for SPSS, .dta for Stata, .sas7bdat for SAS).
6. WHEN a user selects a Cloud_Storage_Connector (Google Drive, OneDrive, Dropbox, Box, Amazon S3), THE Cloud_Storage_Connector SHALL authenticate via OAuth 2.0 or API key and display a file browser showing the user's files.
7. WHEN a user selects a file from cloud storage, THE Cloud_Storage_Connector SHALL download the file and process it using the appropriate File_Connector parser.
8. THE File_Connector SHALL support Parquet file format for columnar data from S3 and local uploads.

### Requirement 9: REST API Connector

**User Story:** As a data analyst, I want to connect to any REST API endpoint without writing code, so that I can import live data from web services into my visualizations.

#### Acceptance Criteria

1. THE REST_API_Connector SHALL allow users to configure a base URL, HTTP method (GET/POST), request headers, and authentication (API key, Bearer token, OAuth 2.0, Basic auth).
2. THE REST_API_Connector SHALL support JSON response parsing with configurable JSONPath for extracting the data array from nested responses.
3. THE REST_API_Connector SHALL support pagination (offset-based, cursor-based, next-link) to fetch complete datasets across multiple API calls.
4. WHEN a user configures and tests a REST API connection, THE REST_API_Connector SHALL display a preview of the parsed response data.
5. THE REST_API_Connector SHALL transform the API response into the standard DataSource format with auto-detected field types.

### Requirement 10: Data Import and Integration with Workspace

**User Story:** As a data analyst, I want imported data from any connector to integrate seamlessly with the existing Data Viz workspace, so that I can immediately create visualizations from connected data.

#### Acceptance Criteria

1. WHEN data is imported from any connector, THE Connector_Engine SHALL transform the result into the existing DataSource format (id, name, fields with detected types and roles, rows, rowCount, importedAt).
2. THE Connector_Engine SHALL detect field types (string, number, date, boolean) and assign roles (dimension, measure) using the same logic as the existing CSV/JSON parsers.
3. WHEN a data import completes, THE Connector_Engine SHALL add the DataSource to the workbook store and make it available for chart encoding.
4. IF a data import exceeds 5,000,000 rows, THEN THE Connector_Engine SHALL warn the user about potential performance degradation and offer to import a sample.
5. THE Connector_Engine SHALL preserve the original column names from the source and use them as field names in the DataSource.

### Requirement 11: Advanced Visualization — Sankey Charts

**User Story:** As a data analyst, I want to create Sankey diagrams to visualize flows and transitions between categories, so that I can identify drop-offs and high-value paths in my data.

#### Acceptance Criteria

1. THE chart type selector SHALL include a "Sankey" option that renders a flow diagram showing transitions between two categorical dimensions.
2. WHEN a user assigns a source dimension to X, a target dimension to Color, and a measure to Y, THE Sankey chart SHALL render flows proportional to the measure value.
3. THE Sankey chart SHALL support hover tooltips showing the source, target, and flow value for each link.
4. THE Sankey chart SHALL support at least 20 unique nodes and 50 links without performance degradation.
5. THE Sankey chart SHALL use the active color palette for node coloring.

### Requirement 12: Groups and Bins

**User Story:** As a data analyst, I want to create custom groups from dimension values and bins from continuous measures, so that I can segment my data for more meaningful analysis.

#### Acceptance Criteria

1. WHEN a user right-clicks a dimension field, THE field panel SHALL offer a "Create Group" action that allows combining multiple dimension values into named groups.
2. WHEN a user right-clicks a measure field, THE field panel SHALL offer a "Create Bin" action that segments the continuous values into equal-sized ranges.
3. THE Groups feature SHALL create a new virtual dimension field that maps original values to group names.
4. THE Bins feature SHALL allow configuring bin size (width) and SHALL create a new dimension field with bin labels (e.g., "0-10", "10-20").
5. Groups and Bins SHALL be usable in all chart encodings (X, Y, Color, Filter) like any other field.

### Requirement 13: Percent of Total Calculation

**User Story:** As a data analyst, I want to apply percent-of-total calculations to any measure, so that I can visualize relative contributions in pie charts, donut charts, and stacked bars.

#### Acceptance Criteria

1. THE aggregation options for measure fields SHALL include "% of Total" in addition to SUM, AVG, COUNT, MIN, MAX.
2. WHEN "% of Total" is selected, THE chart SHALL display each value as a percentage of the total sum across all groups.
3. THE "% of Total" calculation SHALL work with all chart types that support measures (bar, pie, donut, stacked bar, table).
4. THE tooltip SHALL display both the percentage value and the absolute value when "% of Total" is active.

### Requirement 14: Parameter Actions and Dynamic Interactivity

**User Story:** As a data analyst, I want to create parameter-driven interactions where clicking a chart element updates other charts on the dashboard, so that I can build dynamic what-if scenarios.

#### Acceptance Criteria

1. THE dashboard SHALL support creating parameters with a name, data type (string, number, date), and default value.
2. WHEN a user configures a Parameter_Action on a chart, clicking a mark SHALL update the parameter value to the clicked mark's dimension value.
3. OTHER charts on the same dashboard that reference the parameter in their filters SHALL update automatically when the parameter value changes.
4. THE parameter panel SHALL display all active parameters with their current values and allow manual editing.
5. Parameters SHALL support "Input" widgets (text input, dropdown, slider) for manual value entry.

### Requirement 15: AI-Assisted Dashboard Insights

**User Story:** As a data analyst, I want AI-generated summaries and insights about my dashboard data, so that I can quickly understand key trends and anomalies without manual analysis.

#### Acceptance Criteria

1. WHEN a user clicks "Generate Insights" on a chart, THE system SHALL produce a natural language summary describing the key patterns, trends, and outliers in the displayed data.
2. THE insight generation SHALL identify: top/bottom values, significant changes, outliers beyond 2 standard deviations, and trend direction (increasing/decreasing/stable).
3. THE generated insights SHALL be displayed as a text card that can be placed on the dashboard.
4. THE insight generation SHALL work entirely client-side using statistical analysis (no external AI API required for v1).
5. WHEN data changes (new import or filter applied), THE insights SHALL be regenerable with a single click.

### Requirement 16: AI-Assisted Color Palettes

**User Story:** As a data analyst, I want to generate custom color palettes from a text description, so that I can quickly create visually appealing and accessible charts.

#### Acceptance Criteria

1. THE color palette selector SHALL include a "Generate" option where users can type a description (e.g., "ocean blue professional", "warm sunset gradient").
2. THE palette generator SHALL produce 5-10 colors that match the description while maintaining WCAG AA contrast ratios.
3. THE generated palette SHALL be previewable before applying and saveable as a custom palette.
4. THE palette generator SHALL work client-side using predefined color algorithms and HSL manipulation (no external API required for v1).

### Requirement 17: Error Handling and Connectivity Resilience

**User Story:** As a data analyst, I want clear error messages and automatic recovery when connections fail, so that I can troubleshoot issues and resume my work without data loss.

#### Acceptance Criteria

1. IF a network error occurs during data import, THEN THE Connector_Engine SHALL retry the operation up to 3 times with exponential backoff (1s, 2s, 4s delays).
2. IF all retry attempts fail, THEN THE Connector_Engine SHALL display a descriptive error message and preserve any partially imported data.
3. WHEN a connection is lost during a query execution, THE Connector_Engine SHALL notify the user and offer a "Reconnect" action.
4. THE Connector_Engine SHALL log connection errors with timestamps and connector type for diagnostic purposes without exposing sensitive credentials in logs.
5. IF the Connector_Proxy is unreachable, THEN THE Connector_Engine SHALL display a message indicating the backend service is unavailable and suggest checking network connectivity.
