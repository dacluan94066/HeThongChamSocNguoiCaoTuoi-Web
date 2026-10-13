import 'package:google_sign_in/google_sign_in.dart';

import 'api_client.dart';

class GoogleMobileIdentity {
  const GoogleMobileIdentity({
    required this.idToken,
    required this.email,
    required this.displayName,
    this.photoUrl,
  });

  final String idToken;
  final String email;
  final String displayName;
  final String? photoUrl;
}

class GoogleSignInService {
  GoogleSignInService._();

  static final GoogleSignInService instance = GoogleSignInService._();
  static const String _serverClientId = String.fromEnvironment(
    'GOOGLE_WEB_CLIENT_ID',
  );

  final GoogleSignIn _google = GoogleSignIn.instance;
  Future<void>? _initializing;

  Future<void> _ensureInitialized() {
    if (_serverClientId.trim().isEmpty) {
      throw const ApiException(
        'Ứng dụng chưa được cấu hình Google Client ID. Hãy chạy với '
        '--dart-define=GOOGLE_WEB_CLIENT_ID=...',
      );
    }
    return _initializing ??= _google.initialize(
      serverClientId: _serverClientId.trim(),
    );
  }

  Future<GoogleMobileIdentity> authenticate() async {
    await _ensureInitialized();
    if (!_google.supportsAuthenticate()) {
      throw const ApiException(
        'Thiết bị này không hỗ trợ cửa sổ đăng nhập Google.',
      );
    }

    try {
      final account = await _google.authenticate();
      final idToken = account.authentication.idToken;
      if (idToken == null || idToken.isEmpty) {
        throw const ApiException(
          'Google không trả về mã xác thực. Kiểm tra Web Client ID.',
        );
      }
      return GoogleMobileIdentity(
        idToken: idToken,
        email: account.email,
        displayName: account.displayName?.trim() ?? '',
        photoUrl: account.photoUrl,
      );
    } on GoogleSignInException catch (error) {
      if (error.code == GoogleSignInExceptionCode.canceled) {
        throw const ApiException('Bạn đã hủy đăng nhập Google.');
      }
      throw const ApiException(
        'Không thể đăng nhập Google. Kiểm tra SHA-1, package name và Client ID.',
      );
    }
  }

  Future<void> signOut() async {
    if (_initializing == null) return;
    try {
      await _ensureInitialized();
      await _google.signOut();
    } catch (_) {
      // JWT CareSenior van phai duoc xoa du Google SDK khong phan hoi.
    }
  }
}
