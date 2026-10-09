import 'package:flutter/material.dart';
import '../models/care_assistant.dart';

class AssistantMessageBubble extends StatelessWidget {
  const AssistantMessageBubble({
    super.key,
    required this.message,
    required this.onAction,
    required this.onRetry,
    this.enabled = true,
  });
  final AssistantMessage message;
  final ValueChanged<AssistantAction> onAction;
  final VoidCallback onRetry;
  final bool enabled;
  @override
  Widget build(BuildContext context) {
    final user = message.fromUser;
    String two(int n) => n.toString().padLeft(2, '0');
    final fetched = message.reply?.fetchedAt;
    return Align(
      alignment: user ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 620),
        child: Container(
          margin: const EdgeInsets.symmetric(vertical: 7),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: user ? const Color(0xff07856d) : Colors.white,
            borderRadius: BorderRadius.circular(20),
            border: user
                ? null
                : Border.all(
                    color: message.isError
                        ? Colors.red.shade200
                        : const Color(0xffd5e9e2),
                  ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                user
                    ? 'Bạn'
                    : 'Trợ lý chăm sóc • ${message.reply?.modeLabel ?? 'Thông báo'}',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  color: user ? Colors.white : const Color(0xff075944),
                ),
              ),
              const SizedBox(height: 8),
              if (message.reply?.modeNotice != null) ...[
                Text(
                  message.reply!.modeNotice!,
                  style: const TextStyle(
                    fontSize: 14,
                    color: Color(0xff075944),
                  ),
                ),
                const SizedBox(height: 8),
              ],
              SelectableText(
                message.text,
                style: TextStyle(
                  fontSize: 17,
                  height: 1.45,
                  color: user ? Colors.white : const Color(0xff1a3029),
                ),
              ),
              const SizedBox(height: 8),
              Text(
                '${two(message.time.hour)}:${two(message.time.minute)}',
                style: TextStyle(
                  fontSize: 12,
                  color: user ? Colors.white70 : Colors.black54,
                ),
              ),
              if (fetched != null)
                Text(
                  'Lấy dữ liệu lúc ${two(fetched.hour)}:${two(fetched.minute)} · ${two(fetched.day)}/${two(fetched.month)}/${fetched.year}',
                  style: const TextStyle(fontSize: 12, color: Colors.black54),
                ),
              if (message.reply?.truncated == true)
                Text(
                  message.reply?.mode == 'ai'
                      ? 'AI chỉ nhận tối đa 8 mục mỗi nhóm. Mở chức năng để xem thêm.'
                      : 'Đang hiển thị tối đa 50 mục gần nhất.',
                  style: const TextStyle(fontSize: 13),
                ),
              if (message.reply?.actions.isNotEmpty == true)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: message.reply!.actions
                        .map(
                          (action) => OutlinedButton(
                            onPressed: enabled ? () => onAction(action) : null,
                            style: OutlinedButton.styleFrom(
                              minimumSize: const Size(48, 48),
                            ),
                            child: Text(
                              action.label,
                              textAlign: TextAlign.center,
                            ),
                          ),
                        )
                        .toList(),
                  ),
                ),
              if (message.isError && message.retryQuestion != null)
                TextButton.icon(
                  onPressed: enabled ? onRetry : null,
                  icon: const Icon(Icons.refresh),
                  label: const Text('Thử lại tra cứu'),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
