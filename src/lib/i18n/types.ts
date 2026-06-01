export type Locale = 'en' | 'vi';

export interface Translations {
  // App header
  'app.title': string;
  'app.version': string;
  'app.saveName': string;
  'app.renameWorkbook': string;
  'app.signOut': string;

  // Language
  'language.en': string;
  'language.vi': string;
  'language.label': string;

  // Data import - landing
  'import.readyToVisualize': string;
  'import.heroTitle': string;
  'import.heroDescription': string;
  'import.dropTitle': string;
  'import.dropBrowse': string;
  'import.dropHint': string;
  'import.processing': string;
  'import.connectDatabase': string;
  'import.trySampleData': string;
  'import.featureDragDrop': string;
  'import.featureDragDropDesc': string;
  'import.featureAutoDetect': string;
  'import.featureAutoDetectDesc': string;
  'import.featureMultiSource': string;
  'import.featureMultiSourceDesc': string;

  // Data import - compact bar
  'import.sources': string;
  'import.connect': string;
  'import.addSource': string;

  // Data import - options flow
  'import.importFile': string;
  'import.parsingOptions': string;
  'import.cancel': string;
  'import.previewData': string;
  'import.backToOptions': string;
  'import.importRows': string;
  'import.importing': string;
  'import.noData': string;
  'import.showingRows': string;
  'import.fields': string;

  // Data import - file options
  'import.delimiter': string;
  'import.quoteChar': string;
  'import.encoding': string;
  'import.sheet': string;
  'import.headerRow': string;
  'import.pages': string;
  'import.maxRows': string;
  'import.jsonAutomatic': string;
  'import.loadingSheets': string;

  // Sheet tabs
  'sheets.chart': string;
  'sheets.charts': string;
  'sheets.addSheet': string;
  'sheets.removeSheet': string;

  // Field panel
  'fields.title': string;
  'fields.rows': string;
  'fields.dimensions': string;
  'fields.measures': string;
  'fields.virtualFields': string;
  'fields.createGroup': string;
  'fields.createBin': string;
  'fields.addToXAxis': string;
  'fields.addToYAxis': string;
  'fields.addToColor': string;
  'fields.remove': string;
  'fields.group': string;
  'fields.bin': string;

  // Filter panel
  'filters.title': string;
  'filters.addFilter': string;
  'filters.selectField': string;
  'filters.valuePlaceholder': string;
  'filters.add': string;
  'filters.cancel': string;
  'filters.noFilters': string;
  'filters.disable': string;
  'filters.enable': string;
  'filters.remove': string;

  // Chart canvas
  'chart.addChart': string;
  'chart.addChartDesc': string;
  'chart.duplicate': string;
  'chart.remove': string;
  'chart.insights': string;
  'chart.insightsEmpty': string;
  'chart.by': string;

  // Version history
  'versions.title': string;
  'versions.button': string;
  'versions.saveLabel': string;
  'versions.savePlaceholder': string;
  'versions.save': string;
  'versions.noVersions': string;
  'versions.noVersionsDesc': string;
  'versions.restore': string;
  'versions.delete': string;
  'versions.confirmRestore': string;
  'versions.confirm': string;
  'versions.cancel': string;
  'versions.saved': string;

  // Auth page
  'auth.chooseAccount': string;
  'auth.pickUserDescription': string;
  'auth.orSignInManually': string;
  'auth.hideManualLogin': string;
  'auth.username': string;
  'auth.password': string;
  'auth.enterUsername': string;
  'auth.enterPassword': string;
  'auth.signIn': string;
  'auth.demoDeployment': string;
  'auth.welcomeTitle': string;
  'auth.welcomeSubtitle': string;
  'auth.chartTypes': string;
  'auth.chartTypesDesc': string;
  'auth.connectors': string;
  'auth.connectorsDesc': string;
  'auth.filters': string;
  'auth.filtersDesc': string;
  'auth.aiInsights': string;
  'auth.aiInsightsDesc': string;

  // Theme
  'theme.system': string;
  'theme.light': string;
  'theme.dark': string;
  'theme.highContrast': string;
  'theme.highContrastLight': string;

  // Guide
  'guide.skip': string;
  'guide.previous': string;
  'guide.next': string;
  'guide.finish': string;
  'guide.getStarted': string;
  'guide.complete': string;
  'guide.step': string;
  'guide.of': string;
  'guide.openGuide': string;
}
