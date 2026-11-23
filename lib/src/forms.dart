part of 'renderer.dart';

Widget _buildForm(_NodeBuilder b) {
  final id = b.node.id ?? b.p.string('name', b.p.string('key', b.node.path));
  final key = b.renderer.forms.putIfAbsent(id, () => GlobalKey<FormState>());
  final children = b.node.children
      .map((node) => b.render(node, form: id))
      .toList();
  return Form(
    key: key,
    autovalidateMode: b.p.boolean('autovalidate')
        ? AutovalidateMode.onUserInteraction
        : AutovalidateMode.disabled,
    child: b.node.child != null
        ? b.render(b.node.child!, form: id)
        : Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: children,
          ),
  );
}

Widget _buildField(_NodeBuilder b) =>
    _SpaceField(key: ValueKey(b.node.id ?? b.node.path), builder: b);

class _SpaceField extends StatefulWidget {
  final _NodeBuilder builder;
  const _SpaceField({super.key, required this.builder});
  @override
  State<_SpaceField> createState() => _SpaceFieldState();
}

class _SpaceFieldState extends State<_SpaceField> {
  _NodeBuilder get b => widget.builder;
  _Props get p => b.p;
  String get name =>
      p.string('name', p.string('bind', b.node.id ?? b.node.path));
  String? get binding => (p.raw('bind') ?? p.raw('name'))?.toString();
  late dynamic _value;
  dynamic _publishedValue;
  late TextEditingController _text;
  final FocusNode _focus = FocusNode();
  Timer? _debounce;
  Object? _configurationError;
  dynamic _safeInitial([_NodeBuilder? builder]) {
    try {
      _configurationError = null;
      return _initial(builder);
    } catch (error) {
      _configurationError = error;
      return null;
    }
  }

  dynamic _initial([_NodeBuilder? builder]) {
    final source = builder ?? b;
    final props = source.p;
    final bind = (props.raw('bind') ?? props.raw('name'))?.toString();
    final fallback = props.get(
      'initialValue',
      props.get('value', switch (source.node.type) {
        'checkbox' || 'switch' => false,
        'slider' || 'rating' => props.number('min', 0),
        'multiSelect' => const [],
        'rangeSlider' => [props.number('min', 0), props.number('max', 1)],
        _ => null,
      }),
    );
    return bind == null
        ? fallback
        : source.renderer.controller.read(bind, fallback);
  }

  @override
  void initState() {
    super.initState();
    _value = _safeInitial();
    _publishedValue = _value;
    _text = TextEditingController(text: '${_value ?? ''}');
  }

  @override
  void didUpdateWidget(covariant _SpaceField oldWidget) {
    super.didUpdateWidget(oldWidget);
    final value = _safeInitial();
    if (_debounce?.isActive == true &&
        widget.builder.renderer.controller ==
            oldWidget.builder.renderer.controller &&
        binding ==
            (oldWidget.builder.p.raw('bind') ?? oldWidget.builder.p.raw('name'))
                ?.toString() &&
        value == _publishedValue) {
      return;
    }
    _publishedValue = value;
    if (binding == null && value == _safeInitial(oldWidget.builder)) return;
    if (value != _value) {
      _debounce?.cancel();
      _value = value;
      final text = '${value ?? ''}';
      if (_text.text != text) {
        // Replacing the controller lets TextFormField synchronize in its own
        // lifecycle without notifying the ancestor Form during this build.
        final previous = _text;
        _text = TextEditingController.fromValue(
          TextEditingValue(
            text: text,
            selection: TextSelection.collapsed(offset: text.length),
          ),
        );
        WidgetsBinding.instance.addPostFrameCallback((_) => previous.dispose());
      }
    }
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _focus.dispose();
    _text.dispose();
    super.dispose();
  }

  void _change(dynamic value) {
    setState(() => _value = value);
    _debounce?.cancel();
    void publish() {
      if (!mounted) return;
      _publishedValue = value;
      if (binding != null) b.renderer.controller.setValue(binding!, value);
      unawaited(b.action(p.raw('onChanged')));
    }

    if (b.node.type == 'searchField' || b.node.type == 'autocomplete') {
      _debounce = Timer(
        Duration(milliseconds: p.integer('debounce', 300)),
        publish,
      );
    } else {
      publish();
    }
  }

  void _save(dynamic value) {
    if (b.formId != null) {
      b.renderer.formValues.putIfAbsent(b.formId!, () => {})[name] = value;
    }
  }

  String? _validate(dynamic value) {
    final empty =
        value == null ||
        (value is String && value.trim().isEmpty) ||
        (value is List && value.isEmpty) ||
        ((b.node.type == 'checkbox' || b.node.type == 'switch') &&
            value != true);
    if (p.boolean('required') && empty) {
      return p.string('requiredMessage', 'This field is required');
    }
    if (empty) return null;
    if (const [
      'dropdown',
      'radio',
      'multiSelect',
      'autocomplete',
    ].contains(b.node.type)) {
      final allowed = options.map((e) => e['value']).toSet();
      final selected = b.node.type == 'multiSelect'
          ? (value is List ? value : [value])
          : [value];
      if (selected.any((v) => !allowed.contains(v))) {
        return 'Select an available option';
      }
    }
    if (value is String) {
      if (p.raw('minLength') != null &&
          value.length < p.integer('minLength', 0)) {
        return 'Enter at least ${p.integer('minLength', 0)} characters';
      }
      if (p.raw('maxLength') != null &&
          value.length > p.integer('maxLength', 0)) {
        return 'Enter at most ${p.integer('maxLength', 0)} characters';
      }
      if (p.boolean('email') &&
          !RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(value)) {
        return 'Enter a valid email address';
      }
      if (p.raw('pattern') != null &&
          !RegExp(p.string('pattern')).hasMatch(value)) {
        return p.string('patternMessage', 'Invalid value');
      }
    }
    if (value is num) {
      if (p.raw('min') != null && value < p.number('min')!) {
        return 'Minimum value is ${p.number('min')}';
      }
      if (p.raw('max') != null && value > p.number('max')!) {
        return 'Maximum value is ${p.number('max')}';
      }
    }
    if (p.raw('validateCheck') is List &&
        p.list('validateCheck').contains(value)) {
      return 'Invalid value';
    }
    return null;
  }

  InputDecoration get decoration => InputDecoration(
    labelText: p.get('label', p.get('text')) as String?,
    hintText: p.get('hint') as String?,
    helperText: p.get('helperText') as String?,
    filled: p.boolean('filled'),
    fillColor: p.color('backgroundColor'),
    contentPadding: p.raw('padding') == null ? null : p.insets('padding'),
    hintStyle: p.raw('fontSize') == null
        ? null
        : TextStyle(fontSize: p.number('fontSize')),
    prefixIconColor: p.color('iconColor'),
    prefixIcon: p.raw('icon') == null
        ? null
        : Icon(spaceIcons[p.string('icon')] ?? Icons.edit_outlined),
    border: p.raw('borderRadius') == null
        ? Theme.of(context).inputDecorationTheme.border ??
              OutlineInputBorder(borderRadius: BorderRadius.circular(8))
        : OutlineInputBorder(
            borderRadius: BorderRadius.circular(p.positive('borderRadius', 8)),
          ),
    enabledBorder: p.raw('borderColor') == null
        ? null
        : OutlineInputBorder(
            borderRadius: BorderRadius.circular(p.positive('borderRadius', 8)),
            borderSide: BorderSide(
              color: p.color('borderColor')!,
              width: p.positive('borderWidth', 1),
            ),
          ),
  );

  List<Map<String, dynamic>> get options {
    final seen = <dynamic>{};
    return p.list('options').map((option) {
      if (option is! Map<String, dynamic> || !option.containsKey('value')) {
        throw const FormatException('each option requires a value');
      }
      if (!seen.add(option['value'])) {
        throw const FormatException('option values must be unique');
      }
      return option;
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final type = b.node.type;
    // Catch schema errors here as this State builds after the parent renderer.
    try {
      if (_configurationError != null) throw _configurationError!;
      final enabled = p.boolean('enabled', true);
      if ((type == 'searchField' || type == 'autocomplete') &&
          p.integer('debounce', 300) < 0) {
        throw const FormatException('debounce must be nonnegative');
      }
      switch (type) {
        case 'input':
        case 'textField':
        case 'textArea':
        case 'searchField':
          final obscure = p.boolean('obscureText');
          final keyboard = switch (p.string('keyboardType')) {
            'email' => TextInputType.emailAddress,
            'phone' => TextInputType.phone,
            'number' => const TextInputType.numberWithOptions(decimal: true),
            'url' => TextInputType.url,
            _ =>
              type == 'textArea' ? TextInputType.multiline : TextInputType.text,
          };
          return TextFormField(
            controller: _text,
            enabled: enabled,
            readOnly: p.boolean('readOnly'),
            obscureText: obscure,
            keyboardType: keyboard,
            style: p.raw('fontSize') == null ? null : p.textStyle,
            textInputAction: switch (p.string('textInputAction')) {
              'search' => TextInputAction.search,
              'done' => TextInputAction.done,
              'next' => TextInputAction.next,
              'send' => TextInputAction.send,
              _ => null,
            },
            minLines: obscure
                ? 1
                : p.integer('minLines', type == 'textArea' ? 3 : 1),
            maxLines: obscure
                ? 1
                : p.integer('maxLines', type == 'textArea' ? 5 : 1),
            maxLength: p.raw('maxLength') == null
                ? null
                : _positiveInt(p, 'maxLength', 1),
            decoration: decoration,
            onChanged: _change,
            validator: _validate,
            onSaved: _save,
            onFieldSubmitted: p.raw('onSubmitted') == null
                ? null
                : (value) {
                    _debounce?.cancel();
                    _publishedValue = value;
                    if (binding != null) {
                      b.renderer.controller.setValue(binding!, value);
                    }
                    unawaited(
                      b.eventAction(p.raw('onSubmitted'), {'value': value}),
                    );
                  },
          );
        case 'autocomplete':
          final choices = options;
          return RawAutocomplete<Map<String, dynamic>>(
            textEditingController: _text,
            focusNode: _focus,
            displayStringForOption: (option) =>
                '${option['label'] ?? option['value']}',
            optionsBuilder: (value) => choices.where(
              (option) => '${option['label'] ?? option['value']}'
                  .toLowerCase()
                  .contains(value.text.toLowerCase()),
            ),
            onSelected: (option) => _change(option['value']),
            fieldViewBuilder: (context, text, focus, submit) => TextFormField(
              controller: text,
              focusNode: focus,
              enabled: enabled,
              decoration: decoration,
              onChanged: _change,
              validator: (_) => _validate(_value),
              onSaved: (_) => _save(_value),
              onFieldSubmitted: (_) => submit(),
            ),
            optionsViewBuilder: (context, select, choices) => Align(
              alignment: Alignment.topLeft,
              child: Material(
                elevation: 4,
                child: ConstrainedBox(
                  constraints: const BoxConstraints(
                    maxHeight: 240,
                    maxWidth: 360,
                  ),
                  child: ListView(
                    shrinkWrap: true,
                    padding: EdgeInsets.zero,
                    children: [
                      for (final option in choices)
                        ListTile(
                          title: Text('${option['label'] ?? option['value']}'),
                          onTap: () => select(option),
                        ),
                    ],
                  ),
                ),
              ),
            ),
          );
        case 'multiSelect':
          final choices = options;
          if (_value is! List) {
            throw const FormatException('multiSelect value must be a list');
          }
          return FormField<List<dynamic>>(
            initialValue: List.from(_value),
            validator: (_) => _validate(_value),
            onSaved: (_) => _save(_value),
            builder: (field) => InputDecorator(
              decoration: decoration.copyWith(errorText: field.errorText),
              child: Wrap(
                spacing: 8,
                children: [
                  for (final option in choices)
                    FilterChip(
                      label: Text('${option['label'] ?? option['value']}'),
                      selected: (_value as List).contains(option['value']),
                      onSelected: !enabled
                          ? null
                          : (selected) {
                              final values = List<dynamic>.from(_value);
                              selected
                                  ? values.add(option['value'])
                                  : values.remove(option['value']);
                              field.didChange(values);
                              _change(values);
                            },
                    ),
                ],
              ),
            ),
          );
        case 'rangeSlider':
          final min = p.number('min', 0)!, max = p.number('max', 1)!;
          if (max <= min ||
              _value is! List ||
              (_value as List).length != 2 ||
              (_value as List).any((v) => v is! num)) {
            throw const FormatException(
              'rangeSlider requires two numeric endpoints and min < max',
            );
          }
          final values = _value as List;
          if (values[0] > values[1] || values[0] < min || values[1] > max) {
            throw const FormatException(
              'rangeSlider value is outside its bounds',
            );
          }
          return FormField<List<dynamic>>(
            initialValue: List.from(values),
            validator: (_) => _validate(_value),
            onSaved: (_) => _save(_value),
            builder: (field) => InputDecorator(
              decoration: decoration.copyWith(errorText: field.errorText),
              child: RangeSlider(
                values: RangeValues(
                  (values[0] as num).toDouble(),
                  (values[1] as num).toDouble(),
                ),
                min: min,
                max: max,
                divisions: p.raw('divisions') == null
                    ? null
                    : _positiveInt(p, 'divisions', 1),
                onChanged: !enabled
                    ? null
                    : (value) {
                        final values = [value.start, value.end];
                        field.didChange(values);
                        _change(values);
                      },
              ),
            ),
          );
        case 'rating':
          final max = _positiveInt(p, 'max', 5);
          if (max > 10 || _value is! num) {
            throw const FormatException(
              'rating requires a numeric value and max <= 10',
            );
          }
          return FormField<num>(
            initialValue: _value,
            validator: (_) => _validate(_value),
            onSaved: (_) => _save(_value),
            builder: (field) => InputDecorator(
              decoration: decoration.copyWith(errorText: field.errorText),
              child: Wrap(
                children: [
                  for (var i = 1; i <= max; i++)
                    IconButton(
                      tooltip: '$i of $max',
                      icon: Icon(i <= _value ? Icons.star : Icons.star_border),
                      onPressed: !enabled
                          ? null
                          : () {
                              field.didChange(i);
                              _change(i);
                            },
                    ),
                ],
              ),
            ),
          );
        case 'dateRangePicker':
          final first =
              DateTime.tryParse(p.string('firstDate')) ?? DateTime(1900);
          final last =
              DateTime.tryParse(p.string('lastDate')) ?? DateTime(2100, 12, 31);
          if (last.isBefore(first)) {
            throw const FormatException('lastDate must follow firstDate');
          }
          return FormField<dynamic>(
            initialValue: _value,
            validator: (_) => _validate(_value),
            onSaved: (_) => _save(_value),
            builder: (field) => InkWell(
              onTap: !enabled
                  ? null
                  : () async {
                      DateTimeRange? initial;
                      if (_value is Map) {
                        final start = DateTime.tryParse('${_value['start']}'),
                            end = DateTime.tryParse('${_value['end']}');
                        if (start != null &&
                            end != null &&
                            !end.isBefore(start) &&
                            !start.isBefore(first) &&
                            !end.isAfter(last)) {
                          initial = DateTimeRange(start: start, end: end);
                        }
                      }
                      final value = await showDateRangePicker(
                        context: context,
                        firstDate: first,
                        lastDate: last,
                        initialDateRange: initial,
                      );
                      if (!mounted || value == null) return;
                      final range = {
                        'start': value.start.toIso8601String().substring(0, 10),
                        'end': value.end.toIso8601String().substring(0, 10),
                      };
                      field.didChange(range);
                      _change(range);
                    },
              child: InputDecorator(
                decoration: decoration.copyWith(
                  errorText: field.errorText,
                  suffixIcon: const Icon(Icons.date_range),
                ),
                child: Text(
                  _value is Map
                      ? '${_value['start']} – ${_value['end']}'
                      : p.string('hint', 'Select dates'),
                ),
              ),
            ),
          );
        case 'dropdown':
          final choices = options;
          final selected = choices.any((option) => option['value'] == _value)
              ? _value
              : null;
          return FormField<dynamic>(
            initialValue: selected,
            validator: (_) => _validate(_value),
            onSaved: (_) => _save(_value),
            enabled: enabled,
            builder: (field) => InputDecorator(
              decoration: decoration.copyWith(errorText: field.errorText),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<dynamic>(
                  isExpanded: true,
                  value: selected,
                  hint: Text(p.string('hint', 'Select an option')),
                  items: [
                    for (final option in choices)
                      DropdownMenuItem(
                        value: option['value'],
                        child: Text(
                          '${option['label'] ?? option['lable'] ?? option['value']}',
                        ),
                      ),
                  ],
                  onChanged: enabled
                      ? (value) {
                          field.didChange(value);
                          _change(value);
                        }
                      : null,
                ),
              ),
            ),
          );
        case 'checkbox':
        case 'switch':
          return FormField<bool>(
            initialValue: _value == true,
            validator: (_) => _validate(_value),
            onSaved: (_) => _save(_value == true),
            builder: (field) => Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (type == 'checkbox')
                  CheckboxListTile(
                    value: _value == true,
                    title: Text(p.string('label', p.string('text'))),
                    contentPadding: EdgeInsets.zero,
                    onChanged: enabled
                        ? (value) {
                            field.didChange(value);
                            _change(value);
                          }
                        : null,
                  )
                else
                  SwitchListTile(
                    value: _value == true,
                    title: Text(p.string('label', p.string('text'))),
                    contentPadding: EdgeInsets.zero,
                    onChanged: enabled
                        ? (value) {
                            field.didChange(value);
                            _change(value);
                          }
                        : null,
                  ),
                if (field.hasError)
                  Text(
                    field.errorText!,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
              ],
            ),
          );
        case 'radio':
          final choices = options;
          // Use a single RadioGroup to support current Flutter accessibility.
          return FormField<dynamic>(
            initialValue: _value,
            validator: (_) => _validate(_value),
            onSaved: (_) => _save(_value),
            builder: (field) => InputDecorator(
              decoration: decoration.copyWith(errorText: field.errorText),
              child: RadioGroup<dynamic>(
                groupValue: _value,
                onChanged: (value) {
                  if (enabled) {
                    field.didChange(value);
                    _change(value);
                  }
                },
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    for (final option in choices)
                      RadioListTile<dynamic>(
                        value: option['value'],
                        enabled: enabled,
                        title: Text(
                          '${option['label'] ?? option['lable'] ?? option['value']}',
                        ),
                      ),
                  ],
                ),
              ),
            ),
          );
        case 'slider':
          final min = p.number('min', 0)!, max = p.number('max', 1)!;
          if (!min.isFinite || !max.isFinite || max <= min) {
            throw const FormatException('slider max must be greater than min');
          }
          if (_value is! num) {
            throw const FormatException('slider value must be numeric');
          }
          return FormField<double>(
            initialValue: (_value as num).toDouble(),
            validator: (_) => _validate(_value),
            onSaved: (_) => _save(_value),
            builder: (field) => InputDecorator(
              decoration: decoration.copyWith(errorText: field.errorText),
              child: Slider(
                value: (_value as num).toDouble().clamp(min, max),
                min: min,
                max: max,
                divisions: p.raw('divisions') == null
                    ? null
                    : _positiveInt(p, 'divisions', 1),
                label: '$_value',
                onChanged: enabled
                    ? (value) {
                        field.didChange(value);
                        _change(value);
                      }
                    : null,
              ),
            ),
          );
        case 'datePicker':
        case 'timePicker':
          final firstDate =
              DateTime.tryParse(p.string('firstDate')) ?? DateTime(1900);
          final lastDate =
              DateTime.tryParse(p.string('lastDate')) ?? DateTime(2100, 12, 31);
          if (lastDate.isBefore(firstDate)) {
            throw const FormatException(
              'lastDate must be on or after firstDate',
            );
          }
          return FormField<String>(
            initialValue: _value?.toString(),
            validator: (_) => _validate(_value),
            onSaved: (_) => _save(_value),
            builder: (field) => InkWell(
              onTap: !enabled
                  ? null
                  : () async {
                      if (type == 'datePicker') {
                        final first =
                            DateTime.tryParse(p.string('firstDate')) ??
                            DateTime(1900);
                        final last =
                            DateTime.tryParse(p.string('lastDate')) ??
                            DateTime(2100, 12, 31);
                        if (last.isBefore(first)) {
                          throw const FormatException(
                            'lastDate must be on or after firstDate',
                          );
                        }
                        var initial =
                            DateTime.tryParse('${_value ?? ''}') ??
                            DateTime.now();
                        if (initial.isBefore(first)) initial = first;
                        if (initial.isAfter(last)) initial = last;
                        final value = await showDatePicker(
                          context: context,
                          initialDate: initial,
                          firstDate: first,
                          lastDate: last,
                        );
                        if (!mounted || value == null) return;
                        final text = value.toIso8601String().substring(0, 10);
                        field.didChange(text);
                        _change(text);
                      } else {
                        final parts = '${_value ?? ''}'.split(':');
                        final hour = int.tryParse(parts.first),
                            minute = parts.length == 2
                                ? int.tryParse(parts.last)
                                : null;
                        final initial =
                            hour != null &&
                                minute != null &&
                                hour >= 0 &&
                                hour < 24 &&
                                minute >= 0 &&
                                minute < 60
                            ? TimeOfDay(hour: hour, minute: minute)
                            : TimeOfDay.now();
                        final value = await showTimePicker(
                          context: context,
                          initialTime: initial,
                        );
                        if (!mounted || value == null) return;
                        final text =
                            '${value.hour.toString().padLeft(2, '0')}:${value.minute.toString().padLeft(2, '0')}';
                        field.didChange(text);
                        _change(text);
                      }
                    },
              child: InputDecorator(
                decoration: decoration.copyWith(
                  errorText: field.errorText,
                  suffixIcon: Icon(
                    type == 'datePicker'
                        ? Icons.calendar_today
                        : Icons.access_time,
                  ),
                ),
                child: Text('${_value ?? p.string('hint', 'Select')}'),
              ),
            ),
          );
      }
      throw FormatException('unknown field type "$type"');
    } catch (exception) {
      return b.renderer.error(
        context,
        SpaceIssue(b.node.path, exception.toString()),
      );
    }
  }
}
