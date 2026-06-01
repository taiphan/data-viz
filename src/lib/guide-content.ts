import type { Locale } from './i18n';

export interface GuideStep {
  icon: string;
  title: string;
  description: string;
  bullets?: string[];
}

export interface RoleGuide {
  greeting: string;
  subtitle: string;
  steps: GuideStep[];
  closingTitle: string;
  closingMessage: string;
}

type GuideContent = Record<Locale, Record<string, RoleGuide>>;

export const GUIDE_CONTENT: GuideContent = {
  // ============================================================
  // ENGLISH
  // ============================================================
  en: {
    admin: {
      greeting: 'Welcome, Admin',
      subtitle: 'You have full access to manage data sources, users, and platform settings.',
      steps: [
        {
          icon: '🔌',
          title: 'Connect Data Sources',
          description: 'Set up enterprise data connections to power dashboards across your team.',
          bullets: [
            'Click "Connect to Data" in the toolbar',
            'Choose from 60+ connectors (databases, APIs, cloud storage)',
            'Configure OAuth, API keys, or service accounts',
            'Save connection profiles for reuse',
          ],
        },
        {
          icon: '⚙️',
          title: 'Manage Settings & Schedules',
          description: 'Configure data refresh schedules, user permissions, and system health.',
          bullets: [
            'Schedule extracts with cron expressions',
            'Monitor query performance and slow queries',
            'Review system health and active sessions',
            'Set up webhook triggers for real-time updates',
          ],
        },
        {
          icon: '📊',
          title: 'Build Reference Dashboards',
          description: 'Create template workbooks that other users can clone and customize.',
          bullets: [
            'Drag fields onto the X/Y/Color shelves',
            'Choose from 14 chart types (bar, line, sankey, etc.)',
            'Add filters, parameters, and calculated fields',
            'Save as templates for the team',
          ],
        },
        {
          icon: '🚀',
          title: 'Publish & Deploy',
          description: 'Share dashboards with the right people in the right format.',
          bullets: [
            'Generate shareable embed URLs',
            'Export to PDF, PNG, or SVG',
            'Version dashboards for change tracking',
            'Roll back to any previous version',
          ],
        },
      ],
      closingTitle: 'You are all set',
      closingMessage: 'As an admin, focus on data infrastructure and governance. The team can build on top of what you set up.',
    },
    analyst: {
      greeting: 'Welcome, Analyst',
      subtitle: 'You can build dashboards, explore data, and create insights for your team.',
      steps: [
        {
          icon: '📥',
          title: 'Import Your Data',
          description: 'Get your data into the platform — files or live connections.',
          bullets: [
            'Drag and drop files: CSV, Excel, JSON, PDF, Parquet',
            'Or click "Connect to Data" for databases and APIs',
            'Field types are auto-detected (dimension/measure)',
            'Preview data before importing',
          ],
        },
        {
          icon: '🎨',
          title: 'Build Your First Chart',
          description: 'Drag fields to encoding shelves to create visualizations.',
          bullets: [
            'Drop a dimension on X-axis (e.g., date, category)',
            'Drop a measure on Y-axis (e.g., sales, count)',
            'Pick a chart type from the toolbar',
            'Add color, size, and labels for richness',
          ],
        },
        {
          icon: '🔍',
          title: 'Filter & Explore',
          description: 'Narrow down data and find the story behind the numbers.',
          bullets: [
            'Add filters from the right panel',
            'Use parameters for interactive controls',
            'Group categorical values, bin numeric ranges',
            'Click charts to drill down with parameter actions',
          ],
        },
        {
          icon: '🧠',
          title: 'Generate Insights',
          description: 'Let AI surface patterns, outliers, and trends automatically.',
          bullets: [
            'Click "Generate Insights" on any chart',
            'AI detects top values, outliers, and trends',
            'Use the AI palette generator for color schemes',
            'Save dashboards as workbook versions',
          ],
        },
      ],
      closingTitle: 'Time to explore',
      closingMessage: 'Start with one chart, then expand. Use multiple sheets to organize related views into a full dashboard.',
    },
    viewer: {
      greeting: 'Welcome, Viewer',
      subtitle: 'You have read-only access to view dashboards and explore data interactively.',
      steps: [
        {
          icon: '👀',
          title: 'Navigate Dashboards',
          description: 'Browse the sheets and charts your team has built.',
          bullets: [
            'Use the bottom tab bar to switch between sheets',
            'Click any chart to see it in detail',
            'Hover over data points for tooltips',
            'Charts update in real-time as filters change',
          ],
        },
        {
          icon: '🎚️',
          title: 'Use Filters & Parameters',
          description: 'Customize views without changing the underlying data.',
          bullets: [
            'Apply filters from the right panel',
            'Adjust parameters in the parameter panel',
            'Click marks to drill down on dimensions',
            'Combine filters to narrow your focus',
          ],
        },
        {
          icon: '📤',
          title: 'Export & Share',
          description: 'Take dashboards offline or share them with others.',
          bullets: [
            'Export charts to PNG or SVG',
            'Export full dashboards to PDF',
            'Get shareable embed links',
            'Save your filter configurations',
          ],
        },
      ],
      closingTitle: 'Enjoy exploring',
      closingMessage: 'Click around freely — your view is read-only. Filters and parameters only affect what you see, not the underlying data.',
    },
  },

  // ============================================================
  // VIETNAMESE
  // ============================================================
  vi: {
    admin: {
      greeting: 'Chào mừng Quản trị viên',
      subtitle: 'Bạn có toàn quyền quản lý nguồn dữ liệu, người dùng và cài đặt nền tảng.',
      steps: [
        {
          icon: '🔌',
          title: 'Kết nối nguồn dữ liệu',
          description: 'Thiết lập kết nối dữ liệu doanh nghiệp để hỗ trợ các bảng điều khiển cho đội ngũ.',
          bullets: [
            'Nhấn "Kết nối dữ liệu" trên thanh công cụ',
            'Chọn từ 60+ connector (cơ sở dữ liệu, API, lưu trữ đám mây)',
            'Cấu hình OAuth, API key, hoặc tài khoản dịch vụ',
            'Lưu hồ sơ kết nối để tái sử dụng',
          ],
        },
        {
          icon: '⚙️',
          title: 'Quản lý cài đặt và lịch trình',
          description: 'Cấu hình lịch làm mới dữ liệu, quyền người dùng, và sức khỏe hệ thống.',
          bullets: [
            'Lập lịch trích xuất với biểu thức cron',
            'Theo dõi hiệu suất truy vấn và truy vấn chậm',
            'Xem sức khỏe hệ thống và phiên hoạt động',
            'Thiết lập webhook để cập nhật thời gian thực',
          ],
        },
        {
          icon: '📊',
          title: 'Xây dựng bảng điều khiển mẫu',
          description: 'Tạo workbook mẫu để người dùng khác sao chép và tùy chỉnh.',
          bullets: [
            'Kéo trường vào kệ X/Y/Màu',
            'Chọn từ 14 loại biểu đồ (cột, đường, sankey, v.v.)',
            'Thêm bộ lọc, tham số, và trường tính toán',
            'Lưu thành mẫu cho đội ngũ',
          ],
        },
        {
          icon: '🚀',
          title: 'Xuất bản và triển khai',
          description: 'Chia sẻ bảng điều khiển với đúng người, đúng định dạng.',
          bullets: [
            'Tạo URL nhúng có thể chia sẻ',
            'Xuất ra PDF, PNG, hoặc SVG',
            'Phiên bản hóa bảng điều khiển để theo dõi thay đổi',
            'Khôi phục về phiên bản trước bất kỳ',
          ],
        },
      ],
      closingTitle: 'Đã sẵn sàng',
      closingMessage: 'Là quản trị viên, hãy tập trung vào hạ tầng dữ liệu và quản trị. Đội ngũ sẽ xây dựng dựa trên những gì bạn thiết lập.',
    },
    analyst: {
      greeting: 'Chào mừng Chuyên viên phân tích',
      subtitle: 'Bạn có thể xây dựng bảng điều khiển, khám phá dữ liệu, và tạo phân tích cho đội.',
      steps: [
        {
          icon: '📥',
          title: 'Nhập dữ liệu',
          description: 'Đưa dữ liệu vào nền tảng — tệp hoặc kết nối trực tiếp.',
          bullets: [
            'Kéo thả tệp: CSV, Excel, JSON, PDF, Parquet',
            'Hoặc nhấn "Kết nối dữ liệu" cho cơ sở dữ liệu và API',
            'Loại trường được tự động nhận diện (chiều/số đo)',
            'Xem trước dữ liệu trước khi nhập',
          ],
        },
        {
          icon: '🎨',
          title: 'Tạo biểu đồ đầu tiên',
          description: 'Kéo trường vào kệ mã hóa để tạo trực quan hóa.',
          bullets: [
            'Thả chiều vào trục X (ví dụ: ngày, danh mục)',
            'Thả số đo vào trục Y (ví dụ: doanh số, số lượng)',
            'Chọn loại biểu đồ từ thanh công cụ',
            'Thêm màu, kích thước, và nhãn để phong phú hơn',
          ],
        },
        {
          icon: '🔍',
          title: 'Lọc và khám phá',
          description: 'Thu hẹp dữ liệu và tìm câu chuyện đằng sau các con số.',
          bullets: [
            'Thêm bộ lọc từ panel bên phải',
            'Sử dụng tham số cho điều khiển tương tác',
            'Nhóm giá trị danh mục, phân khoảng dữ liệu số',
            'Nhấn vào biểu đồ để đi sâu với hành động tham số',
          ],
        },
        {
          icon: '🧠',
          title: 'Tạo phân tích thông minh',
          description: 'Để AI tự động phát hiện mẫu, ngoại lệ, và xu hướng.',
          bullets: [
            'Nhấn "Tạo phân tích" trên bất kỳ biểu đồ nào',
            'AI phát hiện giá trị cao nhất, ngoại lệ, và xu hướng',
            'Sử dụng trình tạo bảng màu AI cho phối màu',
            'Lưu bảng điều khiển thành phiên bản workbook',
          ],
        },
      ],
      closingTitle: 'Bắt đầu khám phá',
      closingMessage: 'Bắt đầu với một biểu đồ, rồi mở rộng. Dùng nhiều trang để tổ chức các góc nhìn liên quan thành một bảng điều khiển hoàn chỉnh.',
    },
    viewer: {
      greeting: 'Chào mừng Người xem',
      subtitle: 'Bạn có quyền chỉ xem các bảng điều khiển và khám phá dữ liệu tương tác.',
      steps: [
        {
          icon: '👀',
          title: 'Điều hướng bảng điều khiển',
          description: 'Duyệt các trang và biểu đồ mà đội của bạn đã xây dựng.',
          bullets: [
            'Dùng thanh tab dưới cùng để chuyển giữa các trang',
            'Nhấn vào biểu đồ bất kỳ để xem chi tiết',
            'Di chuột qua điểm dữ liệu để xem chú thích',
            'Biểu đồ cập nhật theo thời gian thực khi bộ lọc thay đổi',
          ],
        },
        {
          icon: '🎚️',
          title: 'Dùng bộ lọc và tham số',
          description: 'Tùy chỉnh góc nhìn mà không thay đổi dữ liệu gốc.',
          bullets: [
            'Áp dụng bộ lọc từ panel bên phải',
            'Điều chỉnh tham số trong panel tham số',
            'Nhấn vào điểm để đi sâu trên các chiều',
            'Kết hợp bộ lọc để thu hẹp tập trung',
          ],
        },
        {
          icon: '📤',
          title: 'Xuất và chia sẻ',
          description: 'Đưa bảng điều khiển offline hoặc chia sẻ với người khác.',
          bullets: [
            'Xuất biểu đồ ra PNG hoặc SVG',
            'Xuất toàn bộ bảng điều khiển ra PDF',
            'Lấy liên kết nhúng có thể chia sẻ',
            'Lưu cấu hình bộ lọc của bạn',
          ],
        },
      ],
      closingTitle: 'Khám phá thoải mái',
      closingMessage: 'Cứ tự nhiên nhấn xung quanh — quyền của bạn chỉ là xem. Bộ lọc và tham số chỉ ảnh hưởng đến cái bạn thấy, không phải dữ liệu gốc.',
    },
  },
};
