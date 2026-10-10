import 'package:flutter/material.dart';
import '../../models/care_assistant.dart';
import '../../services/api_client.dart';
import '../../services/care_assistant_controller.dart';
import '../../widgets/assistant_message_bubble.dart';
import '../notifications/notification_screen.dart';
import '../caregiver/caregiver_screen.dart';
import 'care_assistant_records_screen.dart';

class CareAssistantScreen extends StatefulWidget {
  const CareAssistantScreen({super.key, this.controller, this.onNavigate});
  final CareAssistantController? controller;
  final Future<void> Function(AssistantAction, AssistantProfile?)? onNavigate;
  @override
  State<CareAssistantScreen> createState() => _CareAssistantScreenState();
}

class _CareAssistantScreenState extends State<CareAssistantScreen>
    with WidgetsBindingObserver {
  late final CareAssistantController _chat;
  final _input = TextEditingController();
  final _scroll = ScrollController();
  bool _nearBottom = true;
  bool _scrollScheduled = false;
  int _messageCount = 0;
  int? _draftProfileId;
  static const suggestions = [
    'Hôm nay tôi uống thuốc gì?',
    'Lịch khám tiếp theo khi nào?',
    'Chỉ số sức khỏe gần nhất của tôi?',
    'Ai đang chăm sóc tôi?',
    'Tôi có thông báo chưa đọc không?',
    'Hôm nay cần làm những việc gì?',
    'Mở nhật ký chăm sóc.',
    'Làm sao gửi SOS?',
    'Hướng dẫn dùng ứng dụng.',
  ];
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _chat = widget.controller ?? CareAssistantController();
    _chat.addListener(_changed);
    _chat.initialize();
  }

  @override
  void didChangeMetrics() => _followLatest();

  void _followLatest() {
    if (!_nearBottom || _scrollScheduled) return;
    _scrollScheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _scrollScheduled = false;
      if (mounted && _scroll.hasClients && _nearBottom) {
        _scroll.jumpTo(_scroll.position.maxScrollExtent);
      }
    });
  }

  bool _onScroll(ScrollNotification notification) {
    if (notification.depth == 0 &&
        _scroll.hasClients &&
        (notification is ScrollEndNotification ||
            notification is ScrollUpdateNotification &&
                notification.dragDetails != null ||
            notification is OverscrollNotification &&
                notification.dragDetails != null)) {
      _nearBottom = _scroll.position.extentAfter < 100;
    }
    return false;
  }

  void _changed() {
    if (!mounted) return;
    if (_chat.sessionExpired || _draftProfileId != _chat.selected?.id) {
      _input.clear();
      _draftProfileId = _chat.selected?.id;
    }
    if (_chat.messages.isEmpty) {
      _messageCount = 0;
      _nearBottom = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _scroll.hasClients) _scroll.jumpTo(0);
      });
      return;
    }
    // Scrolling the welcome suggestions is not reading earlier conversation.
    if (_messageCount == 0) _nearBottom = true;
    _messageCount = _chat.messages.length;
    _followLatest();
  }

  Future<void> _send() async {
    final text = _input.text;
    if (text.trim().isEmpty || _chat.busy) return;
    if (text.length > 500) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Vui lòng nhập tối đa 500 ký tự.')),
      );
      return;
    }
    _input.clear();
    await _chat.send(text);
  }

  Future<void> _clear() async {
    final accepted = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: const Text('Xóa cuộc trò chuyện?'),
        content: const Text(
          'Tin nhắn chỉ lưu trong phiên này. Sau khi xóa, bạn không thể khôi phục.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialog, false),
            child: const Text('Hủy'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialog, true),
            child: const Text('Xóa'),
          ),
        ],
      ),
    );
    if (accepted == true && mounted) _chat.clearConversation();
  }

  Future<void> _navigate(AssistantAction action) async {
    if (_chat.sessionExpired || _chat.busy) return;
    final version = ApiClient.sessionVersion;
    final profile = _chat.selected;
    if (widget.onNavigate != null) {
      await widget.onNavigate!(action, profile);
      return;
    }
    final Widget screen;
    switch (action) {
      case AssistantAction.notifications:
        screen = const NotificationScreen();
        break;
      case AssistantAction.sos:
        if (_chat.caregiver) return;
        screen = const CaregiverScreen();
        break;
      default:
        screen = CareAssistantRecordsScreen(action: action, profile: profile);
    }
    if (version != ApiClient.sessionVersion || !mounted) return;
    await Navigator.push(context, MaterialPageRoute(builder: (_) => screen));
  }

  @override
  void dispose() {
    _chat.removeListener(_changed);
    WidgetsBinding.instance.removeObserver(this);
    if (widget.controller == null) _chat.dispose();
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: _chat,
    builder: (context, _) => Scaffold(
      resizeToAvoidBottomInset: true,
      backgroundColor: const Color(0xfff3f6f4),
      appBar: AppBar(
        title: const Text('Trợ lý chăm sóc'),
        actions: [
          IconButton(
            tooltip: 'Xóa cuộc trò chuyện',
            onPressed: _chat.busy || _chat.messages.isEmpty ? null : _clear,
            icon: const Icon(Icons.delete_outline),
          ),
        ],
      ),
      body: SafeArea(
        bottom: false,
        child: LayoutBuilder(
          builder: (context, constraints) => Column(
            children: [
              ConstrainedBox(
                constraints: BoxConstraints(
                  maxHeight: constraints.maxHeight * .28,
                ),
                child: SingleChildScrollView(
                  child: Container(
                    width: double.infinity,
                    color: const Color(0xffe5f3ec),
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _chat.modeLabel,
                          style: const TextStyle(
                            fontSize: 13,
                            color: Color(0xff075944),
                          ),
                        ),
                        const SizedBox(height: 6),
                        if (_chat.caregiver && _chat.profiles.isNotEmpty)
                          DropdownButtonFormField<int>(
                            initialValue: _chat.selected?.id,
                            key: ValueKey(
                              'profile-${_chat.selected?.id}-${_chat.profiles.length}',
                            ),
                            isExpanded: true,
                            decoration: const InputDecoration(
                              labelText: 'Hồ sơ đang hỏi',
                              border: OutlineInputBorder(),
                              contentPadding: EdgeInsets.all(12),
                            ),
                            items: _chat.profiles
                                .map(
                                  (p) => DropdownMenuItem(
                                    value: p.id,
                                    child: Text(
                                      p.name,
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                )
                                .toList(),
                            onChanged: _chat.sessionExpired
                                ? null
                                : (id) {
                                    for (final p in _chat.profiles) {
                                      if (p.id == id) {
                                        _chat.selectProfile(p);
                                        break;
                                      }
                                    }
                                  },
                          )
                        else
                          Text(
                            'Hồ sơ: ${_chat.selected?.name ?? (_chat.caregiver ? 'Chưa được phân công' : 'Chưa có hồ sơ liên kết')}',
                            style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 16,
                            ),
                          ),
                        if (_chat.caregiver &&
                            _chat.profiles.length > 1 &&
                            _chat.selected == null)
                          const Text(
                            'Hãy chọn người cao tuổi trước khi hỏi dữ liệu hồ sơ.',
                            style: TextStyle(fontSize: 14),
                          ),
                        const Text(
                          'Thông báo là của tài khoản đang đăng nhập.',
                          style: TextStyle(fontSize: 12, color: Colors.black54),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              Expanded(
                child: _chat.initializing
                    ? const Center(child: CircularProgressIndicator())
                    : _chat.error != null
                    ? Center(
                        child: SingleChildScrollView(
                          padding: const EdgeInsets.all(24),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(_chat.error!, textAlign: TextAlign.center),
                              if (!_chat.sessionExpired)
                                FilledButton(
                                  onPressed: _chat.initialize,
                                  child: const Text('Thử lại tải hồ sơ'),
                                ),
                            ],
                          ),
                        ),
                      )
                    : NotificationListener<ScrollNotification>(
                        onNotification: _onScroll,
                        child: ListView(
                          key: const ValueKey('assistant-messages'),
                          controller: _scroll,
                          padding: const EdgeInsets.fromLTRB(14, 12, 14, 20),
                          children: [
                            if (_chat.messages.isEmpty) ...[
                              const Icon(
                                Icons.support_agent_rounded,
                                size: 64,
                                color: Color(0xff07856d),
                              ),
                              const SizedBox(height: 12),
                              const Text(
                                'Xin chào! Bạn có thể hỏi về chăm sóc, lịch và dữ liệu đã lưu, hoặc hỏi tiếp câu vừa trao đổi.',
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  fontSize: 19,
                                  fontWeight: FontWeight.w600,
                                  height: 1.4,
                                ),
                              ),
                              const SizedBox(height: 8),
                              const Text(
                                'Không tự chẩn đoán, kê thuốc hoặc gửi SOS. Bạn luôn xác nhận thao tác trong màn hình chức năng.',
                                textAlign: TextAlign.center,
                                style: TextStyle(fontSize: 15, height: 1.4),
                              ),
                              const SizedBox(height: 18),
                              const Text(
                                'Khi dùng AI, câu hỏi và ngữ cảnh gần đây được gửi tới Groq để hiểu yêu cầu. Dữ liệu tra cứu được xử lý tại máy chủ ứng dụng. Chat chỉ lưu trong phiên này.',
                                textAlign: TextAlign.center,
                                style: TextStyle(fontSize: 14, height: 1.4),
                              ),
                              const SizedBox(height: 18),
                              Wrap(
                                spacing: 8,
                                runSpacing: 8,
                                children: suggestions
                                    .map(
                                      (q) => OutlinedButton(
                                        onPressed: _chat.busy
                                            ? null
                                            : () => _chat.send(q),
                                        style: OutlinedButton.styleFrom(
                                          minimumSize: const Size(48, 48),
                                          backgroundColor: Colors.white,
                                        ),
                                        child: Text(
                                          q,
                                          textAlign: TextAlign.center,
                                        ),
                                      ),
                                    )
                                    .toList(),
                              ),
                            ],
                            ..._chat.messages.map(
                              (m) => AssistantMessageBubble(
                                message: m,
                                onAction: _navigate,
                                onRetry: () => _chat.send(m.retryQuestion!),
                                enabled: !_chat.busy && !_chat.sessionExpired,
                              ),
                            ),
                            if (_chat.busy)
                              const Padding(
                                padding: EdgeInsets.all(12),
                                child: Row(
                                  children: [
                                    SizedBox(
                                      width: 22,
                                      height: 22,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                      ),
                                    ),
                                    SizedBox(width: 12),
                                    Expanded(
                                      child: Text(
                                        'Đang trả lời…',
                                        style: TextStyle(fontSize: 16),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                          ],
                        ),
                      ),
              ),
              if (!_chat.sessionExpired)
                SafeArea(
                  top: false,
                  left: false,
                  right: false,
                  child: Padding(
                    key: const ValueKey('assistant-composer'),
                    padding: const EdgeInsets.fromLTRB(12, 6, 12, 4),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Expanded(
                          child: ConstrainedBox(
                            constraints: BoxConstraints(
                              maxHeight: (constraints.maxHeight * .32).clamp(
                                64.0,
                                160.0,
                              ),
                            ),
                            child: TextField(
                              key: const ValueKey('assistant-input'),
                              controller: _input,
                              enabled:
                                  !_chat.busy &&
                                  !_chat.initializing &&
                                  _chat.error == null,
                              minLines: 1,
                              maxLines: 4,
                              maxLength: 500,
                              textInputAction: TextInputAction.newline,
                              decoration: InputDecoration(
                                hintText: 'Hỏi trợ lý chăm sóc…',
                                filled: true,
                                fillColor: Colors.white,
                                counterText: '',
                                border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(18),
                                ),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        IconButton.filled(
                          tooltip: 'Gửi câu hỏi',
                          onPressed:
                              _chat.busy ||
                                  _chat.initializing ||
                                  _chat.error != null
                              ? null
                              : _send,
                          style: IconButton.styleFrom(
                            minimumSize: const Size(52, 52),
                            backgroundColor: const Color(0xff07856d),
                          ),
                          icon: const Icon(Icons.send_rounded),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    ),
  );
}
