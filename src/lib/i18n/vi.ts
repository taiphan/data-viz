import { Translations } from './types';

export const vi: Translations = {
  // App header
  'app.title': 'DataViz',
  'app.version': 'v',
  'app.saveName': 'Lưu tên',
  'app.renameWorkbook': 'Đổi tên workbook',
  'app.signOut': 'Đăng xuất',

  // Language
  'language.en': 'English',
  'language.vi': 'Tiếng Việt',
  'language.label': 'Ngôn ngữ',

  // Data import - landing
  'import.readyToVisualize': 'Sẵn sàng trực quan hóa',
  'import.heroTitle': 'Data Viz',
  'import.heroDescription': 'Nền tảng phân tích tự phục vụ. Tải dữ liệu lên, xây dựng biểu đồ tương tác, tạo bảng điều khiển ấn tượng.',
  'import.dropTitle': 'Thả tệp dữ liệu vào đây',
  'import.dropBrowse': 'duyệt',
  'import.dropHint': 'Hỗ trợ CSV, JSON, Excel, PDF, Parquet, TSV và các định dạng thống kê',
  'import.processing': 'Đang xử lý tệp...',
  'import.connectDatabase': 'Kết nối cơ sở dữ liệu',
  'import.trySampleData': 'Dùng thử dữ liệu mẫu',
  'import.featureDragDrop': 'Kéo & Thả',
  'import.featureDragDropDesc': 'Tất cả định dạng phổ biến',
  'import.featureAutoDetect': 'Tự động nhận diện',
  'import.featureAutoDetectDesc': 'Kiểu, vai trò & mẫu',
  'import.featureMultiSource': 'Đa nguồn',
  'import.featureMultiSourceDesc': 'Kết hợp & trộn dữ liệu',

  // Data import - compact bar
  'import.sources': 'Nguồn',
  'import.connect': 'Kết nối',
  'import.addSource': 'Thêm nguồn',

  // Data import - options flow
  'import.importFile': 'Nhập tệp',
  'import.parsingOptions': 'Tùy chọn phân tích',
  'import.cancel': 'Hủy',
  'import.previewData': 'Xem trước',
  'import.backToOptions': 'Quay lại tùy chọn',
  'import.importRows': 'Nhập',
  'import.importing': 'Đang nhập dữ liệu...',
  'import.noData': 'Không có dữ liệu để xem trước.',
  'import.showingRows': 'Hiển thị',
  'import.fields': 'trường',

  // Data import - file options
  'import.delimiter': 'Dấu phân cách',
  'import.quoteChar': 'Ký tự trích dẫn',
  'import.encoding': 'Mã hóa',
  'import.sheet': 'Trang tính',
  'import.headerRow': 'Hàng tiêu đề',
  'import.pages': 'Trang (phân cách bằng dấu phẩy, trống = tất cả)',
  'import.maxRows': 'Số hàng tối đa (trống = tất cả)',
  'import.jsonAutomatic': 'Tệp JSON được phân tích tự động. Không cần tùy chọn bổ sung.',
  'import.loadingSheets': 'Đang tải trang tính...',

  // Sheet tabs
  'sheets.chart': 'biểu đồ',
  'sheets.charts': 'biểu đồ',
  'sheets.addSheet': 'Thêm trang',
  'sheets.removeSheet': 'Xóa',

  // Field panel
  'fields.title': 'Trường dữ liệu',
  'fields.rows': 'hàng',
  'fields.dimensions': 'Chiều',
  'fields.measures': 'Số đo',
  'fields.virtualFields': 'Trường ảo',
  'fields.createGroup': 'Tạo nhóm...',
  'fields.createBin': 'Tạo khoảng...',
  'fields.addToXAxis': 'Thêm vào trục X',
  'fields.addToYAxis': 'Thêm vào trục Y',
  'fields.addToColor': 'Thêm vào Màu',
  'fields.remove': 'Xóa',
  'fields.group': 'Nhóm',
  'fields.bin': 'Khoảng',

  // Filter panel
  'filters.title': 'Bộ lọc',
  'filters.addFilter': 'Thêm bộ lọc',
  'filters.selectField': 'Chọn trường...',
  'filters.valuePlaceholder': 'Giá trị (phân cách bằng dấu phẩy cho \'in\')',
  'filters.add': 'Thêm',
  'filters.cancel': 'Hủy',
  'filters.noFilters': 'Chưa áp dụng bộ lọc',
  'filters.disable': 'Tắt',
  'filters.enable': 'Bật',
  'filters.remove': 'Xóa',

  // Chart canvas
  'chart.addChart': 'Thêm biểu đồ',
  'chart.addChartDesc': 'Nhấn để tạo trực quan hóa mới',
  'chart.duplicate': 'Nhân bản',
  'chart.remove': 'Xóa',
  'chart.insights': 'Phân tích thông minh',
  'chart.insightsEmpty': 'Gán trường vào trục X và Y để tạo phân tích.',
  'chart.by': 'theo',

  // Version history
  'versions.title': 'Lịch sử phiên bản',
  'versions.button': 'Phiên bản',
  'versions.saveLabel': 'Lưu trạng thái hiện tại',
  'versions.savePlaceholder': 'Mô tả phiên bản này...',
  'versions.save': 'Lưu',
  'versions.noVersions': 'Chưa có phiên bản nào',
  'versions.noVersionsDesc': 'Lưu phiên bản để theo dõi thay đổi workbook',
  'versions.restore': 'Khôi phục',
  'versions.delete': 'Xóa',
  'versions.confirmRestore': 'Khôi phục phiên bản này?',
  'versions.confirm': 'Xác nhận',
  'versions.cancel': 'Hủy',
  'versions.saved': 'phiên bản đã lưu',

  // Auth page
  'auth.chooseAccount': 'Chọn tài khoản demo',
  'auth.pickUserDescription': 'Chọn người dùng bên dưới để khám phá nền tảng, hoặc đăng nhập thủ công.',
  'auth.orSignInManually': 'Hoặc đăng nhập thủ công',
  'auth.hideManualLogin': 'Ẩn đăng nhập thủ công',
  'auth.username': 'Tên đăng nhập',
  'auth.password': 'Mật khẩu',
  'auth.enterUsername': 'Nhập tên đăng nhập',
  'auth.enterPassword': 'Nhập mật khẩu',
  'auth.signIn': 'Đăng nhập',
  'auth.demoDeployment': 'Đây là bản demo. Tất cả dữ liệu được lưu trong trình duyệt của bạn.',
  'auth.welcomeTitle': 'Phân tích tự phục vụ\ncho đội ngũ của bạn.',
  'auth.welcomeSubtitle': 'Tải dữ liệu lên, tạo biểu đồ, xây dựng bảng điều khiển tương tác. Kết nối hơn 60 nguồn dữ liệu với tính năng doanh nghiệp.',
  'auth.chartTypes': '14 Loại Biểu Đồ',
  'auth.chartTypesDesc': 'Cột, đường, phân tán, sankey...',
  'auth.connectors': '60+ Kết Nối',
  'auth.connectorsDesc': 'Cơ sở dữ liệu, API, lưu trữ đám mây',
  'auth.filters': 'Bộ Lọc Thời Gian Thực',
  'auth.filtersDesc': 'Bảng điều khiển tương tác',
  'auth.aiInsights': 'AI Phân Tích',
  'auth.aiInsightsDesc': 'Tự động phát hiện xu hướng',

  // Theme
  'theme.system': 'Hệ thống',
  'theme.light': 'Sáng',
  'theme.dark': 'Tối',
  'theme.highContrast': 'Tương phản cao (Tối)',
  'theme.highContrastLight': 'Tương phản cao (Sáng)',
};
