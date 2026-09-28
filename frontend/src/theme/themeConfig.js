// src/theme/themeConfig.js
// Cấu hình Ant Design theme - Hệ thống Y tế Người cao tuổi
// Màu chủ đạo: xanh dương y tế #2E7D9A

export const COLORS = {
  // Màu chính
  primary:        '#2E7D9A',
  primaryDark:    '#1a5f78',
  primaryLight:   '#4A9BB5',
  primaryBg:      '#EBF5FB',

  // Màu phụ (thành công / tích cực)
  success:        '#4CAF93',
  successDark:    '#367A65',
  successBg:      '#E8F8F5',

  // Cảnh báo
  warning:        '#F5A623',
  warningBg:      '#FEF6E6',

  // Lỗi / Khẩn cấp
  error:          '#E15554',
  errorBg:        '#FDEEEE',
  urgent:         '#C0392B',

  // Mặc định / trung tính
  default:        '#8C8C8C',
  defaultBg:      '#F5F5F5',

  // Nền & bề mặt
  bgPage:         '#F5F7FA',
  bgCard:         '#FFFFFF',
  bgSidebar:      '#1B4965',
  bgSidebarHover: '#24618A',
  bgHeader:       '#FFFFFF',

  // Text
  textPrimary:    '#1A2E3B',
  textSecondary:  '#3D5263',
  textMuted:      '#7A93A3',
  textDisabled:   '#BFBFBF',

  // Border
  border:         '#D0E4EE',
  borderLight:    '#E8F0F5',
};

// Antd ConfigProvider theme token
const themeConfig = {
  token: {
    // Màu semantic
    colorPrimary:   COLORS.primary,
    colorSuccess:   COLORS.success,
    colorWarning:   COLORS.warning,
    colorError:     COLORS.error,
    colorTextBase:  COLORS.textPrimary,
    colorBgBase:    COLORS.bgCard,
    colorBorder:    COLORS.border,

    // Typography — dễ đọc cho người lớn tuổi
    fontSize:          16,
    fontSizeSM:        14,
    fontSizeLG:        18,
    fontSizeXL:        20,
    fontSizeHeading1:  26,
    fontSizeHeading2:  22,
    fontSizeHeading3:  18,
    fontFamily: "'Inter', 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
    fontWeightStrong:  700,
    lineHeight:        1.6,

    // Layout
    borderRadius:     8,
    borderRadiusLG:   12,
    borderRadiusSM:   6,
    borderRadiusXS:   4,

    // Spacing
    marginXXS:  4,
    marginXS:   8,
    marginSM:   12,
    margin:     16,
    marginMD:   20,
    marginLG:   24,
    marginXL:   32,

    // Control (input/button chiều cao)
    controlHeight:   44,
    controlHeightLG: 52,
    controlHeightSM: 34,

    // Shadow
    boxShadow:      '0 2px 8px rgba(46, 125, 154, 0.08)',
    boxShadowSecondary: '0 4px 16px rgba(46, 125, 154, 0.12)',
  },

  components: {
    // ===== BUTTON =====
    Button: {
      borderRadius:       8,
      borderRadiusLG:     10,
      controlHeight:      44,
      controlHeightLG:    52,
      fontWeight:         600,
      primaryShadow:      '0 4px 12px rgba(46, 125, 154, 0.35)',
    },

    // ===== INPUT =====
    Input: {
      controlHeight:      44,
      controlHeightLG:    52,
      borderRadius:       8,
      paddingInline:      14,
      fontSize:           16,
      colorBgContainer:   '#FAFCFD',
      activeShadow:       '0 0 0 3px rgba(46, 125, 154, 0.15)',
    },

    // ===== SELECT =====
    Select: {
      controlHeight:    44,
      borderRadius:     8,
      fontSize:         16,
      optionFontSize:   16,
      optionHeight:     40,
    },

    // ===== FORM =====
    Form: {
      labelFontSize:    15,
      labelColor:       '#3D5263',
      labelColonMarginInlineEnd: 8,
    },

    // ===== TABLE =====
    Table: {
      headerBg:             '#EBF5FB',
      headerColor:          COLORS.textPrimary,
      headerSortActiveBg:   '#D6EAF4',
      headerSortHoverBg:    '#DDF0F8',
      rowHoverBg:           '#F4FAFD',
      borderRadius:         0,
      cellFontSize:         15,
      headerFontSize:       15,
      cellPaddingBlock:     14,
      cellPaddingInline:    16,
    },

    // ===== MENU (SIDEBAR) =====
    Menu: {
      darkItemBg:             COLORS.bgSidebar,
      darkSubMenuItemBg:      '#16394F',
      darkItemSelectedBg:     'rgba(74, 155, 181, 0.25)',
      darkItemSelectedColor:  '#FFFFFF',
      darkItemColor:          'rgba(255,255,255,0.78)',
      darkItemHoverBg:        'rgba(255,255,255,0.08)',
      darkItemHoverColor:     '#FFFFFF',
      darkGroupTitleColor:    'rgba(255,255,255,0.45)',
      itemHeight:             44,
      iconSize:               18,
      fontSize:               15,
      subMenuItemBg:          'transparent',
      collapsedIconSize:      20,
    },

    // ===== CARD =====
    Card: {
      borderRadiusLG:     12,
      headerFontSize:     16,
      headerFontSizeSM:   15,
      boxShadow:          '0 2px 8px rgba(46, 125, 154, 0.08)',
      paddingLG:          24,
    },

    // ===== MODAL =====
    Modal: {
      borderRadiusLG:   14,
      titleFontSize:    18,
      headerBg:         '#FAFCFD',
      titleLineHeight:  1.4,
    },

    // ===== TAG =====
    Tag: {
      borderRadius:     6,
      fontSize:         14,
      fontSizeSM:       13,
    },

    // ===== BADGE =====
    Badge: {
      fontSize:  12,
    },

    // ===== LAYOUT =====
    Layout: {
      siderBg:          COLORS.bgSidebar,
      headerBg:         COLORS.bgHeader,
      bodyBg:           COLORS.bgPage,
      triggerBg:        COLORS.primaryDark,
      triggerColor:     '#FFFFFF',
    },

    // ===== CHECKBOX =====
    Checkbox: {
      borderRadiusSM:     5,
      controlInteractiveSize: 20,
      fontSize:           16,
    },

    // ===== PAGINATION =====
    Pagination: {
      fontSize:           15,
      controlHeight:      36,
    },

    // ===== ALERT =====
    Alert: {
      borderRadius:   10,
      fontSize:       15,
    },

    // ===== PROGRESS =====
    Progress: {
      defaultColor:   COLORS.primary,
      remainingColor: COLORS.borderLight,
    },

    // ===== TOOLTIP =====
    Tooltip: {
      fontSize:       14,
      borderRadius:   8,
    },
  },
};

export default themeConfig;
