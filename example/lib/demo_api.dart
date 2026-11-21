/// In-memory reference backend. Runs unchanged behind the local HTTP server
/// and in workflow tests. These transactions are demonstrations, not fulfilment.
class DemoApi {
  int quantity = 0;
  int playbackSeconds = 0;
  bool lessonComplete = false;
  bool paid = false;
  bool booked = false;
  int deliveryStage = 0;
  final messages = <Map<String, dynamic>>[
    {'text': 'Welcome to the workspace.'},
  ];

  Map<String, dynamic> _w(
    String type, [
    Map<String, dynamic> props = const {},
  ]) => {'type': type, ...props};
  Map<String, dynamic> _text(String value) =>
      _w('text', {'text': value, 'fontSize': 16});
  Map<String, dynamic> _button(String title, dynamic action) =>
      _w('filledButton', {'text': title, 'action': action});
  Map<String, dynamic> _nav(String source, {bool refresh = false}) => {
    'type': 'navigate',
    'source': source,
    'refreshOnReturn': refresh,
  };
  Map<String, dynamic> _request(
    String source, [
    Map<String, dynamic> data = const {},
  ]) => {'type': 'request', 'source': source, 'method': 'POST', 'data': data};
  Map<String, dynamic> _field(
    String type,
    String name,
    String label, {
    bool required = false,
    Map<String, dynamic> props = const {},
  }) =>
      _w(type, {'name': name, 'label': label, 'required': required, ...props});
  Map<String, dynamic> _form(
    String id,
    List<Map<String, dynamic>> fields,
    String label,
    String source,
  ) => _w('form', {
    'id': id,
    'children': [
      for (final field in fields) ...[
        field,
        _w('sizedBox', {'height': 16}),
      ],
      _button(label, {
        'type': 'submit',
        'form': id,
        'source': source,
        'onFailure': {
          'type': 'snackbar',
          'message': 'Please check your selection and try again.',
        },
      }),
    ],
  });
  Map<String, dynamic> _screen(
    String title,
    List<Map<String, dynamic>> children, {
    Map<String, dynamic> state = const {},
  }) => {
    'success': true,
    'schemaVersion': 1,
    'state': state,
    'widgets': _w('scaffold', {
      'appBar': _w('appBar', {'title': title}),
      'body': _w('safeArea', {
        'child': _w('listView', {
          'padding': 24,
          'children': [
            for (final child in children) ...[
              child,
              _w('sizedBox', {'height': 16}),
            ],
          ],
        }),
      }),
    }),
  };

  Future<Map<String, dynamic>> handle(
    String path, {
    String method = 'GET',
    Map<String, dynamic> data = const {},
    Map<String, dynamic> query = const {},
  }) async {
    switch (path) {
      case '/ui/home':
        return _screen('Explore SpaceWidget', [
          _text('Choose a workspace'),
          for (final entry in <String, String>{
            'Shop': 'commerce',
            'Watch': 'streaming',
            'Learn': 'education',
            'Health': 'healthcare',
            'Food': 'food',
            'Messages': 'social',
            'Travel': 'travel',
            'Admin': 'admin',
          }.entries)
            _button(entry.key, _nav('/ui/${entry.value}')),
        ]);
      case '/ui/commerce':
        return _screen(
          'Shop',
          [
            _w('card', {
              'child': _w('padding', {
                'padding': 24,
                'child': _text('Everyday headphones · USD 30'),
              }),
            }),
            _field(
              'dropdown',
              'variant',
              'Color',
              props: {
                'initialValue': 'black',
                'options': [
                  {'label': 'Black', 'value': 'black'},
                  {'label': 'White', 'value': 'white'},
                ],
              },
            ),
            _w('quantitySelector', {'bind': 'quantity', 'min': 1, 'max': 10}),
            _button('Add to cart', {
              ..._request('/actions/cart', {
                'quantity': '{{quantity}}',
                'variant': '{{variant}}',
              }),
              'onSuccess': _nav('/ui/cart', refresh: true),
            }),
            _button('View cart', _nav('/ui/cart')),
          ],
          state: {'quantity': 1, 'variant': 'black'},
        );
      case '/ui/cart':
        return _screen('Your cart', [
          _text('Items: $quantity'),
          _text('Total: USD ${quantity * 30}'),
          if (quantity > 0)
            _button('Create checkout', _request('/actions/checkout')),
        ]);
      case '/actions/cart':
        final value = data['quantity'];
        if (method != 'POST' ||
            value is! int ||
            value < 1 ||
            value > 10 ||
            !['black', 'white'].contains(data['variant'])) {
          return {'success': false, 'message': 'Invalid product selection'};
        }
        quantity += value;
        return {
          'success': true,
          'state': {'cartQuantity': quantity},
        };
      case '/actions/checkout':
        if (quantity < 1) return {'success': false, 'message': 'Cart is empty'};
        return _screen('Checkout', [
          _text('Demo checkout · no money will be charged'),
          _button('Confirm demo payment', _request('/actions/payment/confirm')),
          _text(
            'For a live store, connect hosted checkout and verify its session on your backend.',
          ),
        ]);
      case '/actions/payment/confirm':
        paid = true;
        return _screen('Order confirmed', [
          _text('Demo order paid'),
          _text('Receipt: SW-001'),
        ]);
      case '/ui/streaming':
        return _screen('Watch', [
          _w('card', {
            'child': _w('padding', {
              'padding': 24,
              'child': _text('Nature shorts · Butterfly'),
            }),
          }),
          _button('Watch now', _nav('/ui/player')),
        ]);
      case '/ui/player':
        return _screen(
          'Butterfly',
          [
            _w('videoPlayer', {
              'src': 'https://flutter.github.io/assets-for-api-docs/assets/videos/butterfly.mp4',
              'positionBind': 'playback.seconds',
              'onComplete': _request('/actions/watch/complete'),
            }),
            _button(
              'Save progress',
              _request('/actions/progress', {
                'seconds': '{{playback.seconds}}',
              }),
            ),
            _text('Saved position: {{playback.saved}} seconds'),
          ],
          state: {
            'playback': {'seconds': playbackSeconds, 'saved': playbackSeconds},
          },
        );
      case '/actions/progress':
        final seconds = data['seconds'];
        if (seconds is! num || seconds < 0) {
          return {'success': false, 'message': 'Invalid playback position'};
        }
        playbackSeconds = seconds.toInt();
        return {
          'success': true,
          'state': {
            'playback': {'seconds': playbackSeconds, 'saved': playbackSeconds},
          },
        };
      case '/actions/watch/complete':
        return {
          'success': true,
          'state': {'finished': true},
        };
      case '/ui/education':
        return _screen('Learn', [
          _text('Flutter foundations'),
          _text(lessonComplete ? 'Completed' : 'Ready to begin'),
          _button('Open lesson', {
            ..._nav('/ui/lesson'),
            'offlineFallback': true,
          }),
        ]);
      case '/ui/lesson':
        return _screen('Lesson one', [
          _text('A Flutter screen is composed from widgets.'),
          _w('linearProgressIndicator', {'value': lessonComplete ? 1 : .5}),
          _form(
            'quiz',
            [
              _field(
                'radio',
                'answer',
                'What builds a Flutter screen?',
                required: true,
                props: {
                  'options': [
                    {'label': 'Widgets', 'value': 'widgets'},
                    {'label': 'SQL tables', 'value': 'tables'},
                  ],
                },
              ),
            ],
            'Submit quiz',
            '/actions/quiz',
          ),
        ]);
      case '/actions/quiz':
        if (data['answer'] != 'widgets') {
          return {'success': false, 'message': 'Try again'};
        }
        lessonComplete = true;
        return _screen('Lesson completed', [
          _text('Score: 100%'),
          _text('Your progress has been saved.'),
        ]);
      case '/ui/healthcare':
        return _screen('Care appointments', [
          _text('Dr. Sam · General consultation'),
          _form(
            'booking',
            [
              _field('input', 'patient', 'Patient name', required: true),
              _field(
                'radio',
                'slot',
                'Available slot',
                required: true,
                props: {
                  'options': booked
                      ? []
                      : [
                          {'label': 'Tomorrow, 10:00 AM', 'value': 'slot-10'},
                        ],
                },
              ),
            ],
            'Book appointment',
            '/actions/appointment',
          ),
          _button('View documents', _nav('/ui/documents')),
        ]);
      case '/actions/appointment':
        if (booked ||
            data['slot'] != 'slot-10' ||
            '${data['patient'] ?? ''}'.trim().isEmpty) {
          return {'success': false, 'message': 'Slot unavailable'};
        }
        booked = true;
        return _screen('Appointment booked', [
          _text('Tomorrow at 10:00 AM'),
          _text('Reference: VISIT-001'),
        ]);
      case '/ui/documents':
        return _screen('Documents', [
          _w('documentViewer', {
            'src': '{{app.apiBase}}/documents/sample.pdf',
            'height': 360,
          }),
          _form(
            'upload',
            [
              _w('filePicker', {
                'name': 'files',
                'label': 'Choose a document',
                'required': true,
              }),
            ],
            'Upload document',
            '/actions/documents',
          ),
          _text('Use synthetic documents in this demo.'),
        ]);
      case '/actions/documents':
        return {
          'success': true,
          'actions': {'type': 'snackbar', 'message': 'Demo document received'},
        };
      case '/ui/food':
        return _screen(
          'Food',
          [
            _text('Garden bowl · USD 12'),
            _field(
              'multiSelect',
              'extras',
              'Extras',
              props: {
                'options': [
                  {'label': 'Avocado', 'value': 'avocado'},
                  {'label': 'Extra sauce', 'value': 'sauce'},
                ],
              },
            ),
            _button(
              'Place demo order',
              _request('/actions/food', {'extras': '{{extras}}'}),
            ),
          ],
          state: {'extras': []},
        );
      case '/actions/food':
        deliveryStage = 0;
        return _screen(
          'Track your order',
          [
            _w('live', {
              'stream': 'updates',
              'source': '/live/order',
              'bind': 'order',
              'child': _w('column', {
                'mainAxisSize': 'min',
                'children': [
                  _text('Status: {{order.status}}'),
                  _text('ETA: {{order.eta}}'),
                  _w('map', {
                    'latitude': '{{order.latitude}}',
                    'longitude': '{{order.longitude}}',
                    'height': 240,
                    'markers': [
                      {
                        'latitude': '{{order.latitude}}',
                        'longitude': '{{order.longitude}}',
                        'label': 'Your delivery',
                      },
                    ],
                  }),
                ],
              }),
            }),
          ],
          state: {'order': live('/live/order')},
        );
      case '/ui/social':
        return _screen(
          'Messages',
          [
            _w('live', {
              'stream': 'updates',
              'source': '/live/chat',
              'bind': 'chat',
              'child': _w('repeat', {
                'items': '{{chat.messages}}',
                'template': _w('listTile', {
                  'title': '{{item.text}}',
                  'literal': true,
                }),
              }),
            }),
            _form(
              'message',
              [_field('input', 'message', 'Message', required: true)],
              'Send message',
              '/actions/message',
            ),
          ],
          state: {'chat': live('/live/chat')},
        );
      case '/actions/message':
        final text = '${data['message'] ?? ''}'.trim();
        if (text.isEmpty) return {'success': false};
        messages.add({'text': text});
        return {
          'success': true,
          'state': {'message': '', 'chat': live('/live/chat')},
        };
      case '/ui/travel':
        return _screen('Stay somewhere new', [
          _form(
            'stay',
            [
              _field(
                'dateRangePicker',
                'dates',
                'Travel dates',
                required: true,
              ),
              _field('input', 'guest', 'Guest name', required: true),
            ],
            'Reserve demo room',
            '/actions/reservation',
          ),
        ]);
      case '/actions/reservation':
        final dates = data['dates'];
        if (dates is! Map ||
            dates['start'] == null ||
            dates['end'] == null ||
            '${data['guest'] ?? ''}'.trim().isEmpty) {
          return {'success': false, 'message': 'Select dates and guest'};
        }
        return _screen('Reservation confirmed', [
          _text('Demo reference: STAY-001'),
          _text('${dates['start']} to ${dates['end']}'),
        ]);
      case '/ui/admin':
        return _screen('Workspace overview', [
          _w('chart', {
            'values': [12, 18, 14, 28, 31],
            'height': 180,
          }),
          _w('dataTable', {
            'selectable': true,
            'bind': 'selectedRows',
            'pageSize': 2,
            'columns': [
              {'label': 'Name', 'key': 'name'},
              {'label': 'Amount', 'key': 'amount', 'numeric': true},
            ],
            'rows': [
              {'id': '1', 'name': 'Order A', 'amount': 30},
              {'id': '2', 'name': 'Order B', 'amount': 12},
              {'id': '3', 'name': 'Order C', 'amount': 90},
            ],
          }),
          _text('Selected: {{selectedRows}}'),
        ]);
      case '/data/products':
        final cursor = int.tryParse('${query['cursor'] ?? 0}') ?? 0;
        return {
          'success': true,
          'data': {
            'items': [
              for (var i = cursor; i < cursor + 10; i++)
                {'id': i, 'name': 'Product $i'},
            ],
            'nextCursor': cursor >= 20 ? null : cursor + 10,
          },
        };
      default:
        return {'success': false, 'message': 'Unknown demo endpoint'};
    }
  }

  Map<String, dynamic> live(String path) {
    if (path == '/live/chat') {
      return {'messages': List<Map<String, dynamic>>.from(messages)};
    }
    if (path == '/live/payment') return {'status': paid ? 'paid' : 'pending'};
    final stage = deliveryStage.clamp(0, 3);
    return {
      'status': ['Preparing', 'Picked up', 'Arriving', 'Delivered'][stage],
      'eta': stage == 3 ? 'Delivered' : '${12 - stage * 3} minutes',
      'latitude': 12.9716 + stage * .001,
      'longitude': 77.5946 + stage * .001,
    };
  }
}
