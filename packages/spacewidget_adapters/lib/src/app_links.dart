import 'dart:async';

import 'package:app_links/app_links.dart';

import 'client.dart';

/// Instantiate during app startup so cold and warm OS links are captured.
/// Configure verified Android/iOS app links and disable Flutter's built-in
/// deep-link handler when using this plugin. The client checks return URLs.
class SpaceAppLinks {
  final SpaceClient client;
  StreamSubscription<Uri>? _subscription;
  final void Function(Object error)? onError;
  SpaceAppLinks({required this.client, this.onError, Stream<Uri>? links}) {
    _subscription = (links ?? AppLinks().uriLinkStream).listen((uri) async {
      try {
        await client.handleReturnLink(uri);
      } catch (error) {
        onError?.call(error);
      }
    }, onError: (Object error) => onError?.call(error));
  }
  Future<void> dispose() async => _subscription?.cancel();
}
