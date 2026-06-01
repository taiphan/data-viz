import { Translations } from './types';

export const en: Translations = {
  // App header
  'app.title': 'DataViz',
  'app.version': 'v',
  'app.saveName': 'Save name',
  'app.renameWorkbook': 'Rename workbook',
  'app.signOut': 'Sign out',

  // Language
  'language.en': 'English',
  'language.vi': 'Tiếng Việt',
  'language.label': 'Language',

  // Data import - landing
  'import.readyToVisualize': 'Ready to visualize',
  'import.heroTitle': 'FE CREDIT Analytics',
  'import.heroDescription': 'Self-service analytics platform for FE CREDIT. Upload data, build interactive charts, create stunning dashboards.',
  'import.dropTitle': 'Drop your data file here',
  'import.dropBrowse': 'browse',
  'import.dropHint': 'Supports CSV, JSON, Excel, PDF, Parquet, TSV, and statistical formats',
  'import.processing': 'Processing your file...',
  'import.connectDatabase': 'Connect to Database',
  'import.trySampleData': 'Try Sample Data',
  'import.featureDragDrop': 'Drag & Drop',
  'import.featureDragDropDesc': 'All major file formats',
  'import.featureAutoDetect': 'Auto-Detect',
  'import.featureAutoDetectDesc': 'Types, roles & patterns',
  'import.featureMultiSource': 'Multi-Source',
  'import.featureMultiSourceDesc': 'Join & blend datasets',

  // Data import - compact bar
  'import.sources': 'Sources',
  'import.connect': 'Connect',
  'import.addSource': 'Add Source',

  // Data import - options flow
  'import.importFile': 'Import File',
  'import.parsingOptions': 'Parsing Options',
  'import.cancel': 'Cancel',
  'import.previewData': 'Preview Data',
  'import.backToOptions': 'Back to Options',
  'import.importRows': 'Import',
  'import.importing': 'Importing data...',
  'import.noData': 'No data to preview.',
  'import.showingRows': 'Showing',
  'import.fields': 'fields',

  // Data import - file options
  'import.delimiter': 'Delimiter',
  'import.quoteChar': 'Quote Character',
  'import.encoding': 'Encoding',
  'import.sheet': 'Sheet',
  'import.headerRow': 'Header Row',
  'import.pages': 'Pages (comma-separated, blank = all)',
  'import.maxRows': 'Max Rows (blank = all)',
  'import.jsonAutomatic': 'JSON files are parsed automatically. No additional options needed.',
  'import.loadingSheets': 'Loading sheets...',

  // Sheet tabs
  'sheets.chart': 'chart',
  'sheets.charts': 'charts',
  'sheets.addSheet': 'Add sheet',
  'sheets.removeSheet': 'Remove',

  // Field panel
  'fields.title': 'Fields',
  'fields.rows': 'rows',
  'fields.dimensions': 'Dimensions',
  'fields.measures': 'Measures',
  'fields.virtualFields': 'Virtual Fields',
  'fields.createGroup': 'Create Group...',
  'fields.createBin': 'Create Bin...',
  'fields.addToXAxis': 'Add to X Axis',
  'fields.addToYAxis': 'Add to Y Axis',
  'fields.addToColor': 'Add to Color',
  'fields.remove': 'Remove',
  'fields.group': 'Group',
  'fields.bin': 'Bin',

  // Filter panel
  'filters.title': 'Filters',
  'filters.addFilter': 'Add filter',
  'filters.selectField': 'Select field...',
  'filters.valuePlaceholder': 'Value (comma-separated for \'in\')',
  'filters.add': 'Add',
  'filters.cancel': 'Cancel',
  'filters.noFilters': 'No filters applied',
  'filters.disable': 'Disable',
  'filters.enable': 'Enable',
  'filters.remove': 'Remove',

  // Chart canvas
  'chart.addChart': 'Add Chart',
  'chart.addChartDesc': 'Click to create a new visualization',
  'chart.duplicate': 'Duplicate',
  'chart.remove': 'Remove',
  'chart.insights': 'Generate Insights',
  'chart.insightsEmpty': 'Assign fields to X and Y axes to generate insights.',
  'chart.by': 'by',

  // Version history
  'versions.title': 'Version History',
  'versions.button': 'Versions',
  'versions.saveLabel': 'Save current state',
  'versions.savePlaceholder': 'Describe this version...',
  'versions.save': 'Save',
  'versions.noVersions': 'No versions saved yet',
  'versions.noVersionsDesc': 'Save a version to track your workbook changes',
  'versions.restore': 'Restore',
  'versions.delete': 'Delete',
  'versions.confirmRestore': 'Restore this version?',
  'versions.confirm': 'Confirm',
  'versions.cancel': 'Cancel',
  'versions.saved': 'versions saved',

  // Auth page
  'auth.chooseAccount': 'Choose a demo account',
  'auth.pickUserDescription': 'Pick a user below to explore the platform, or sign in manually.',
  'auth.orSignInManually': 'Or sign in manually',
  'auth.hideManualLogin': 'Hide manual login',
  'auth.username': 'Username',
  'auth.password': 'Password',
  'auth.enterUsername': 'Enter username',
  'auth.enterPassword': 'Enter password',
  'auth.signIn': 'Sign In',
  'auth.demoDeployment': 'This is a demo deployment. All data is stored in your browser.',
  'auth.welcomeTitle': 'Self-service analytics\nfor your team.',
  'auth.welcomeSubtitle': 'Upload data, build charts, create interactive dashboards. Connect to 60+ data sources with enterprise-grade features.',
  'auth.chartTypes': '14 Chart Types',
  'auth.chartTypesDesc': 'Bar, line, scatter, sankey...',
  'auth.connectors': '60+ Connectors',
  'auth.connectorsDesc': 'Databases, APIs, cloud storage',
  'auth.filters': 'Real-time Filters',
  'auth.filtersDesc': 'Interactive dashboards',
  'auth.aiInsights': 'AI Insights',
  'auth.aiInsightsDesc': 'Auto-detect patterns',

  // Theme
  'theme.system': 'System',
  'theme.light': 'Light',
  'theme.dark': 'Dark',
  'theme.highContrast': 'High Contrast Dark',
  'theme.highContrastLight': 'High Contrast Light',

  // Guide
  'guide.skip': 'Skip tour',
  'guide.previous': 'Previous',
  'guide.next': 'Next',
  'guide.finish': 'Finish',
  'guide.getStarted': 'Get Started',
  'guide.complete': 'Complete',
  'guide.step': 'Step',
  'guide.of': 'of',
  'guide.openGuide': 'Help & Guide',

  // Sample data
  'import.sampleDataTitle': 'Try a sample dataset',
  'import.sampleDataSubtitle': 'Pick a pre-built dataset to start exploring instantly.',
  'import.sampleDataHint': 'Charts auto-configure with the first dimension and measure.',

  // Keyboard shortcuts
  'shortcuts.title': 'Keyboard Shortcuts',
  'shortcuts.openHelp': 'Show this help',
  'shortcuts.openGuide': 'Open onboarding guide',
  'shortcuts.toggleTheme': 'Toggle theme',
  'shortcuts.openSearch': 'Search fields',
  'shortcuts.addChart': 'Add chart',
  'shortcuts.duplicateChart': 'Duplicate chart',
  'shortcuts.removeChart': 'Remove chart',
  'shortcuts.escape': 'Close any dialog',

  // Common (extra)
  'common.cancel': 'Cancel',
  'common.fields': 'fields',
};
