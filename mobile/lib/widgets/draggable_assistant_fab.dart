import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../theme/care_senior_theme.dart';

/// A movable shortcut for the elderly assistant. Its position is shared by
/// the normal app screens and clamped whenever the viewport changes.
class DraggableAssistantFabHost extends StatefulWidget {
  const DraggableAssistantFabHost({
    super.key,
    required this.child,
    required this.onPressed,
    this.visible = true,
  });

  final Widget child;
  final VoidCallback onPressed;
  final bool visible;

  @override
  State<DraggableAssistantFabHost> createState() =>
      _DraggableAssistantFabHostState();
}

class _DraggableAssistantFabHostState extends State<DraggableAssistantFabHost> {
  static const _sideKey = 'assistant_fab_right_edge';
  static const _heightKey = 'assistant_fab_vertical_fraction';
  static const _hintKey = 'assistant_fab_hint_seen';
  static const _width = 132.0;
  static const _height = 56.0;
  static const _margin = 12.0;

  bool _rightEdge = true;
  double _verticalFraction = 1;
  Offset? _dragPosition;
  bool _showHint = false;
  Timer? _hintTimer;

  @override
  void initState() {
    super.initState();
    unawaited(_restore());
  }

  Future<void> _restore() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      if (!mounted) return;
      setState(() {
        _rightEdge = preferences.getBool(_sideKey) ?? true;
        _verticalFraction = (preferences.getDouble(_heightKey) ?? 1).clamp(
          0,
          1,
        );
        _showHint = !(preferences.getBool(_hintKey) ?? false);
      });
      if (_showHint) {
        _hintTimer = Timer(const Duration(seconds: 6), _dismissHint);
      }
    } on MissingPluginException {
      // The shortcut still works with its default position in test hosts.
    }
  }

  Future<void> _dismissHint() async {
    if (!mounted || !_showHint) return;
    _hintTimer?.cancel();
    setState(() => _showHint = false);
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setBool(_hintKey, true);
    } on MissingPluginException {
      // Saving this presentation hint is best-effort.
    }
  }

  Future<void> _savePosition() async {
    try {
      final preferences = await SharedPreferences.getInstance();
      await preferences.setBool(_sideKey, _rightEdge);
      await preferences.setDouble(_heightKey, _verticalFraction);
    } on MissingPluginException {
      // Keep the current in-memory position when storage is unavailable.
    }
  }

  @override
  void dispose() {
    _hintTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final keyboardOpen = MediaQuery.viewInsetsOf(context).bottom > 0;
      if (!widget.visible ||
          keyboardOpen ||
          constraints.maxWidth < _width + 24 ||
          constraints.maxHeight < _height + 24) {
        return widget.child;
      }

      final minY = _margin + MediaQuery.paddingOf(context).top;
      final maxY =
          constraints.maxHeight -
          _height -
          _margin -
          MediaQuery.paddingOf(context).bottom;
      if (maxY < minY) return widget.child;
      final maxX = constraints.maxWidth - _width - _margin;
      final x = (_dragPosition?.dx ?? (_rightEdge ? maxX : _margin)).clamp(
        _margin,
        maxX,
      );
      final y = (_dragPosition?.dy ?? minY + (maxY - minY) * _verticalFraction)
          .clamp(minY, maxY);

      return Stack(
        fit: StackFit.expand,
        children: [
          widget.child,
          if (_showHint && constraints.maxWidth >= 235 + _margin * 2)
            Positioned(
              left: (x + _width - 235).clamp(
                _margin,
                constraints.maxWidth - 235 - _margin,
              ),
              top: y >= minY + 72 ? y - 69 : y + _height + 8,
              width: 235,
              child: IgnorePointer(
                child: Material(
                  color: CareSeniorColors.text,
                  borderRadius: BorderRadius.circular(12),
                  elevation: 4,
                  child: const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                    child: Text(
                      'Chạm để hỏi AI · Kéo để di chuyển',
                      style: TextStyle(color: Colors.white, fontSize: 15),
                    ),
                  ),
                ),
              ),
            ),
          AnimatedPositioned(
            duration: _dragPosition == null
                ? const Duration(milliseconds: 180)
                : Duration.zero,
            curve: Curves.easeOut,
            left: x,
            top: y,
            child: Semantics(
              label: 'Hỏi trợ lý AI, có thể kéo để di chuyển',
              button: true,
              child: GestureDetector(
                key: const ValueKey('draggable-assistant-fab'),
                onTap: () {
                  unawaited(_dismissHint());
                  widget.onPressed();
                },
                onPanStart: (_) {
                  unawaited(_dismissHint());
                  setState(() => _dragPosition = Offset(x, y));
                },
                onPanUpdate: (details) {
                  final current = _dragPosition ?? Offset(x, y);
                  setState(() {
                    _dragPosition = Offset(
                      (current.dx + details.delta.dx).clamp(_margin, maxX),
                      (current.dy + details.delta.dy).clamp(minY, maxY),
                    );
                  });
                },
                onPanEnd: (_) {
                  final dropped = _dragPosition ?? Offset(x, y);
                  setState(() {
                    _rightEdge =
                        dropped.dx + _width / 2 > constraints.maxWidth / 2;
                    _verticalFraction = maxY == minY
                        ? 0
                        : ((dropped.dy - minY) / (maxY - minY)).clamp(0, 1);
                    _dragPosition = null;
                  });
                  unawaited(_savePosition());
                },
                onPanCancel: () => setState(() => _dragPosition = null),
                child: Material(
                  color: CareSeniorColors.deepGreen,
                  borderRadius: BorderRadius.circular(28),
                  elevation: 6,
                  child: const SizedBox(
                    width: _width,
                    height: _height,
                    child: Row(
                      children: [
                        SizedBox(width: 17),
                        Icon(
                          Icons.chat_bubble_outline_rounded,
                          color: Colors.white,
                          size: 23,
                        ),
                        SizedBox(width: 7),
                        Flexible(
                          child: Text(
                            'Hỏi AI',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        SizedBox(width: 12),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      );
    },
  );
}
