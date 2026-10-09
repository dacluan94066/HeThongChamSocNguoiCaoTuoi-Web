enum AssistantAction {
  medications('Lịch uống thuốc'),
  appointments('Lịch khám'),
  health('Chỉ số sức khỏe'),
  caregivers('Người chăm sóc / liên hệ'),
  notifications('Thông báo'),
  notes('Nhật ký chăm sóc'),
  sos('Mở màn hình SOS');

  const AssistantAction(this.label);
  final String label;
  static AssistantAction? fromName(Object? value) {
    for (final action in values) {
      if (action.name == value) return action;
    }
    return null;
  }
}

class AssistantProfile {
  const AssistantProfile(this.id, this.name);
  final int id;
  final String name;
  factory AssistantProfile.fromJson(Map<String, dynamic> data) =>
      AssistantProfile(
        (data['id'] as num).toInt(),
        data['hoTen']?.toString() ?? 'Hồ sơ',
      );
}

class AssistantReply {
  const AssistantReply({
    required this.text,
    required this.intent,
    this.actions = const [],
    this.rows = const [],
    this.fetchedAt,
    this.truncated = false,
    this.mode = 'functional',
    this.modeReason,
    this.aiFailureCode,
  });
  final String text;
  final String intent;
  final List<AssistantAction> actions;
  final List<Map<String, dynamic>> rows;
  final DateTime? fetchedAt;
  final bool truncated;
  final String mode;
  final String? modeReason;
  final String? aiFailureCode;
  String get modeLabel => mode == 'ai' ? 'AI' : 'Trợ lý theo chức năng';
  String? get modeNotice => switch (modeReason) {
    'missing_config' => 'AI chưa được cấu hình. Đang tra cứu theo chức năng.',
    'ai_unavailable' => switch (aiFailureCode) {
      'AI_RATE_LIMITED' =>
        'Dịch vụ AI đã đạt hạn mức. Đang dùng tra cứu dự phòng.',
      'AI_TIMEOUT' =>
        'AI trả lời quá thời gian chờ. Đang dùng tra cứu dự phòng.',
      'AI_TOOL_GENERATION_FAILED' =>
        'AI chưa xử lý được câu hỏi này. Đang dùng tra cứu dự phòng.',
      'AI_HTTP_401' || 'AI_HTTP_403' =>
        'Dịch vụ AI từ chối truy cập. Cần kiểm tra cấu hình backend. Đang dùng tra cứu dự phòng.',
      _ => 'AI tạm thời không khả dụng. Đang dùng tra cứu dự phòng.',
    },
    'safety' => 'Hướng dẫn an toàn theo chức năng.',
    _ => null,
  };
  factory AssistantReply.fromJson(Map<String, dynamic> data) => AssistantReply(
    text: data['text']?.toString() ?? '',
    intent: data['intent']?.toString() ?? 'unknown',
    actions: (data['actions'] as List? ?? [])
        .map(AssistantAction.fromName)
        .whereType<AssistantAction>()
        .toList(),
    rows: (data['rows'] as List? ?? [])
        .whereType<Map>()
        .map((v) => Map<String, dynamic>.from(v))
        .toList(),
    fetchedAt: DateTime.tryParse(
      data['fetchedAt']?.toString() ?? '',
    )?.toLocal(),
    truncated: data['truncated'] == true,
    mode: data['mode'] == 'ai' ? 'ai' : 'functional',
    modeReason: data['modeReason']?.toString(),
    aiFailureCode: data['aiFailureCode']?.toString(),
  );
}

class AssistantHistoryTurn {
  const AssistantHistoryTurn(this.role, this.content);
  final String role;
  final String content;
  Map<String, String> toJson() => {'role': role, 'content': content};
}

class AssistantMessage {
  AssistantMessage({
    required this.text,
    required this.fromUser,
    DateTime? time,
    this.reply,
    this.retryQuestion,
    this.isError = false,
  }) : time = time ?? DateTime.now();
  final String text;
  final bool fromUser;
  final DateTime time;
  final AssistantReply? reply;
  final bool isError;
  final String? retryQuestion;
}
