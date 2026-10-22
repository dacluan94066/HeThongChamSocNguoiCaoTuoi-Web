import 'package:flutter/material.dart';

import '../screens/profile/complete_profile_screen.dart';
import '../services/api_client.dart';
import '../services/auth_service.dart';
import '../services/elderly_service.dart';

/// All elderly login paths (password, Google and restored sessions) enter here.
/// Only the explicit missing-profile response starts onboarding, never an outage.
class ElderlyProfileGate extends StatefulWidget {
  const ElderlyProfileGate({super.key, required this.child});
  final Widget child;

  @override
  State<ElderlyProfileGate> createState() => _ElderlyProfileGateState();
}

class _ElderlyProfileGateState extends State<ElderlyProfileGate> {
  bool _loading = true;
  bool _ready = false;
  bool _loggingOut = false;
  String? _error;
  Map<String, dynamic>? _account;
  int _request = 0;

  @override
  void initState() {
    super.initState();
    _check();
  }

  Future<void> _check() async {
    final version = ApiClient.sessionVersion;
    final request = ++_request;
    bool current() =>
        mounted && request == _request && version == ApiClient.sessionVersion;
    setState(() {
      _loading = true;
      _ready = false;
      _account = null;
      _error = null;
    });
    try {
      await ElderlyService.instance.getMyProfile(refresh: true);
      if (current()) {
        setState(() {
          _ready = true;
          _loading = false;
        });
      }
    } on ApiException catch (error) {
      if (!current()) return;
      if (error.statusCode == 404 &&
          error.errorCode == 'ELDERLY_PROFILE_NOT_FOUND') {
        try {
          final account = await AuthService.instance.getMe();
          if (!current()) return;
          if (account['tenVaiTro'] != 'NguoiCaoTuoi') {
            setState(() {
              _loading = false;
              _error =
                  'Tài khoản này không dùng cho Mobile. Vui lòng đăng xuất.';
            });
            return;
          }
          setState(() {
            _account = account;
            _loading = false;
          });
        } catch (_) {
          if (current()) {
            setState(() {
              _loading = false;
              _error = 'Không thể tải thông tin tài khoản. Vui lòng thử lại.';
            });
          }
        }
      } else {
        setState(() {
          _loading = false;
          _error = error.message;
        });
      }
    } catch (_) {
      if (current()) {
        setState(() {
          _loading = false;
          _error = 'Không thể kiểm tra hồ sơ. Vui lòng thử lại.';
        });
      }
    }
  }

  Future<void> _logout() async {
    if (_loggingOut) return;
    setState(() => _loggingOut = true);
    try {
      await AuthService.instance.logout();
      if (mounted) {
        Navigator.pushNamedAndRemoveUntil(context, '/login', (_) => false);
      }
    } catch (_) {
      if (mounted) {
        setState(() => _loggingOut = false);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Không thể đăng xuất. Vui lòng thử lại.'),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_ready) return widget.child;
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (_account != null) {
      return CompleteProfileScreen(
        account: _account!,
        onCompleted: _check,
        onLogout: _loggingOut ? null : _logout,
      );
    }
    return Scaffold(
      appBar: AppBar(title: const Text('Hồ sơ cá nhân')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                _error ?? 'Không thể tải hồ sơ.',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 20),
              FilledButton(onPressed: _check, child: const Text('Thử lại')),
              const SizedBox(height: 12),
              OutlinedButton(
                onPressed: _loggingOut ? null : _logout,
                child: const Text('Đăng xuất'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
