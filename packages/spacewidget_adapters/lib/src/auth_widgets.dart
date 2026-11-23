import 'dart:async';

import 'package:flutter/material.dart';
import 'package:spacewidget/spacewidget.dart';

import 'client.dart';

Map<String, SpaceWidgetBuilder> spaceAuthWidgets(SpaceClient client) => {
  for (final entry in {
    'loginForm': 'login',
    'signUpForm': 'register',
    'forgotPasswordForm': 'forgot',
    'resetPasswordForm': 'reset',
    'otpForm': 'otp',
  }.entries)
    entry.key: (space) =>
        _AuthPanel(client: client, space: space, initialMode: entry.value),
  'authGate': (space) {
    final data =
        space.node.props[client.signedIn ? 'then' : 'else'] ?? space.node.child;
    if (data is SpaceNode) return space.build(data);
    if (data is Map<String, dynamic>) {
      return space.build(SpaceNode.fromJson(data));
    }
    return const SizedBox.shrink();
  },
};

class _AuthPanel extends StatefulWidget {
  final SpaceClient client;
  final SpaceBuildContext space;
  final String initialMode;
  const _AuthPanel({
    required this.client,
    required this.space,
    required this.initialMode,
  });
  @override
  State<_AuthPanel> createState() => _AuthPanelState();
}

class _AuthPanelState extends State<_AuthPanel> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController(),
      _password = TextEditingController(),
      _name = TextEditingController(),
      _code = TextEditingController();
  late String _mode;
  bool _busy = false;
  String? _message;
  @override
  void initState() {
    super.initState();
    _mode = widget.initialMode;
    _email.text = widget.client.user?['email']?.toString() ?? '';
  }

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _name.dispose();
    _code.dispose();
    super.dispose();
  }

  String? _required(String? value) =>
      value == null || value.trim().isEmpty ? 'This field is required' : null;
  void _switch(String mode) {
    setState(() {
      _mode = mode;
      _message = null;
      _password.clear();
      _code.clear();
    });
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _message = null;
    });
    try {
      final values = {
        'name': _name.text.trim(),
        'email': _email.text.trim(),
        'password': _password.text,
        'code': _code.text.trim(),
      };
      final operation = {
        'login': 'authLogin',
        'register': 'authRegister',
        'forgot': 'authRequestReset',
        'reset': 'authResetPassword',
        'otp': 'authVerifyOtp',
      }[_mode]!;
      final result = await widget.client.services.execute(
        SpaceRequest(source: operation, data: values),
        operation: operation,
      );
      if (!mounted) return;
      if (!result.success) {
        setState(
          () => _message =
              result.message ??
              result.data['message']?.toString() ??
              'Please try again.',
        );
        return;
      }
      _password.clear();
      if (_mode == 'forgot') {
        _switch('reset');
        setState(
          () => _message = 'If this account exists, a code has been sent.',
        );
        return;
      }
      final action = widget.space.node.props['onSuccess'];
      if (action != null) {
        await widget.space.dispatch(action);
      } else if (mounted) {
        setState(
          () => _message = _mode == 'otp'
              ? 'Email verified.'
              : 'Signed in successfully.',
        );
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => _message = 'Unable to complete this request. Please try again.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    String configured(String key, String fallback) =>
        _mode == widget.initialMode
        ? widget.space.controller
                  .resolve(widget.space.node.props[key])
                  ?.toString() ??
              fallback
        : fallback;
    final defaultTitle = {
      'login': 'Welcome back',
      'register': 'Create your account',
      'forgot': 'Reset your password',
      'reset': 'Choose a new password',
      'otp': 'Verify your email',
    }[_mode]!;
    final title = configured('title', defaultTitle);
    final subtitle = configured('subtitle', '');
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 420),
        child: AutofillGroup(
          child: Form(
            key: _form,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: [
                const SizedBox(height: 20),
                Icon(
                  _mode == 'otp'
                      ? Icons.verified_user_outlined
                      : Icons.lock_outline,
                  size: 40,
                  color: Theme.of(context).colorScheme.primary,
                ),
                const SizedBox(height: 20),
                Text(
                  title,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                if (subtitle.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(subtitle, textAlign: TextAlign.center),
                ],
                const SizedBox(height: 24),
                if (_mode == 'register') ...[
                  TextFormField(
                    controller: _name,
                    enabled: !_busy,
                    autofillHints: const [AutofillHints.name],
                    decoration: InputDecoration(
                      labelText: configured('nameLabel', 'Name'),
                      border: const OutlineInputBorder(),
                    ),
                    validator: _required,
                  ),
                  const SizedBox(height: 16),
                ],
                TextFormField(
                  controller: _email,
                  enabled: !_busy,
                  autofillHints: const [AutofillHints.email],
                  keyboardType: TextInputType.emailAddress,
                  decoration: InputDecoration(
                    labelText: configured('emailLabel', 'Email'),
                    border: const OutlineInputBorder(),
                  ),
                  validator: (v) =>
                      _required(v) ??
                      (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
                              .hasMatch(v!.trim())
                          ? 'Enter a valid email'
                          : null),
                ),
                const SizedBox(height: 16),
                if (_mode == 'otp' || _mode == 'reset') ...[
                  TextFormField(
                    controller: _code,
                    enabled: !_busy,
                    keyboardType: TextInputType.number,
                    autofillHints: const [AutofillHints.oneTimeCode],
                    decoration: InputDecoration(
                      labelText: configured('codeLabel', '6-digit code'),
                      border: const OutlineInputBorder(),
                    ),
                    validator: (v) => RegExp(r'^\d{6}$').hasMatch(v ?? '')
                        ? null
                        : 'Enter the 6-digit code',
                  ),
                  const SizedBox(height: 16),
                ],
                if (const ['login', 'register', 'reset'].contains(_mode)) ...[
                  TextFormField(
                    controller: _password,
                    enabled: !_busy,
                    obscureText: true,
                    autofillHints: [
                      _mode == 'login'
                          ? AutofillHints.password
                          : AutofillHints.newPassword,
                    ],
                    decoration: InputDecoration(
                      labelText: configured('passwordLabel', 'Password'),
                      border: const OutlineInputBorder(),
                    ),
                    validator: (v) =>
                        _required(v) ??
                        (v!.length < 10 ? 'Use at least 10 characters' : null),
                    onFieldSubmitted: (_) =>
                        _busy ? null : unawaited(_submit()),
                  ),
                  const SizedBox(height: 16),
                ],
                if (_message != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 16),
                    child: Semantics(
                      liveRegion: true,
                      child: Text(
                        _message!,
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.primary,
                        ),
                      ),
                    ),
                  ),
                FilledButton(
                  onPressed: _busy ? null : _submit,
                  child: Text(
                    _busy
                        ? 'Please wait…'
                        : configured(
                            'submitText',
                            _mode == 'forgot'
                                ? 'Send reset code'
                                : _mode == 'otp'
                                ? 'Verify email'
                                : _mode == 'reset'
                                ? 'Update password'
                                : _mode == 'register'
                                ? 'Create account'
                                : 'Sign in',
                          ),
                  ),
                ),
                if (_mode == 'login') ...[
                  for (final provider in const ['google', 'apple'])
                    if (widget.space.controller.read(
                          'capabilities.${provider}OAuth',
                        ) ==
                        true)
                      OutlinedButton(
                        onPressed: _busy
                            ? null
                            : () async {
                                setState(() {
                                  _busy = true;
                                  _message = null;
                                });
                                try {
                                  final action = widget.space.read('onSuccess');
                                  final source = action is Map
                                      ? action['source']
                                      : null;
                                  final destination =
                                      action is Map &&
                                          [
                                            'navigate',
                                            'replace',
                                          ].contains(action['type']) &&
                                          source is String &&
                                          source.startsWith('/runtime/screens/')
                                      ? <String, dynamic>{
                                          'screenId': source.substring(
                                            '/runtime/screens/'.length,
                                          ),
                                          'query':
                                              action['query'] ??
                                              <String, dynamic>{},
                                        }
                                      : null;
                                  final result = await widget.client
                                      .startOAuthSignIn(
                                        provider: provider,
                                        destination: destination,
                                      );
                                  if (mounted) {
                                    setState(() => _message = result.message);
                                  }
                                } catch (_) {
                                  if (mounted) {
                                    setState(
                                      () => _message =
                                          'Unable to start sign-in. Try again.',
                                    );
                                  }
                                } finally {
                                  if (mounted) setState(() => _busy = false);
                                }
                              },
                        child: Text(
                          provider == 'apple'
                              ? 'Continue with Apple'
                              : 'Continue with Google',
                        ),
                      ),
                  TextButton(
                    onPressed: _busy ? null : () => _switch('forgot'),
                    child: const Text('Forgot password?'),
                  ),
                  TextButton(
                    onPressed: _busy ? null : () => _switch('register'),
                    child: const Text('Create an account'),
                  ),
                ],
                if (_mode != 'login')
                  TextButton(
                    onPressed: _busy ? null : () => _switch('login'),
                    child: const Text('Back to sign in'),
                  ),
                if (_mode == 'otp')
                  TextButton(
                    onPressed: _busy
                        ? null
                        : () async {
                            final result = await widget.client.services.execute(
                              SpaceRequest(
                                source: 'authRequestOtp',
                                data: {'email': _email.text},
                              ),
                              operation: 'authRequestOtp',
                            );
                            if (mounted) {
                              setState(
                                () => _message = result.success
                                    ? 'A verification code has been sent.'
                                    : result.message ?? 'Unable to send code.',
                              );
                            }
                          },
                    child: const Text('Send a verification code'),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
