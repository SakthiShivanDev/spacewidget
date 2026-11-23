part of 'renderer.dart';

// Inline design assets also render on mobile, where data: URIs cannot be sent
// through Image.network. Reuse decoded bytes across ordinary document rebuilds.
final _inlineImageBytes = <String, Uint8List>{};
int _inlineImageByteCount = 0;
Uint8List _decodeInlineImage(String source) {
  final cached = _inlineImageBytes.remove(source);
  if (cached != null) {
    _inlineImageBytes[source] = cached;
    return cached;
  }
  if (source.length > 12 * 1024 * 1024) {
    throw const FormatException('inline image exceeds the 8 MB limit');
  }
  final data = UriData.parse(source);
  if (!const [
        'image/png',
        'image/jpeg',
        'image/webp',
        'image/gif',
      ].contains(data.mimeType) ||
      !data.isBase64) {
    throw const FormatException(
      'inline image must be base64 PNG, JPEG, WebP or GIF',
    );
  }
  final bytes = data.contentAsBytes();
  if (bytes.length > 8 * 1024 * 1024) {
    throw const FormatException('inline image exceeds the 8 MB limit');
  }
  while (_inlineImageBytes.isNotEmpty &&
      _inlineImageByteCount + bytes.length > 8 * 1024 * 1024) {
    _inlineImageByteCount -= _inlineImageBytes
        .remove(_inlineImageBytes.keys.first)!
        .length;
  }
  _inlineImageBytes[source] = bytes;
  _inlineImageByteCount += bytes.length;
  return bytes;
}

/// All built-in type names. A custom builder may add or override any type.
const spaceWidgetTypes = <String>{
  'customWidget',
  'scaffold',
  'appBar',
  'drawer',
  'navigationBar',
  'bottomNavigationBar',
  'navigationRail',
  'defaultTabController',
  'tabBar',
  'tabBarView',
  'tab',
  'safeArea',
  'container',
  'padding',
  'center',
  'align',
  'sizedBox',
  'sizedBoxFill',
  'row',
  'column',
  'stack',
  'positioned',
  'expanded',
  'flexible',
  'spacer',
  'wrap',
  'listView',
  'gridView',
  'singleChildScrollView',
  'pageView',
  'aspectRatio',
  'constrainedBox',
  'fractionallySizedBox',
  'clipRRect',
  'clipOval',
  'fittedBox',
  'text',
  'selectableText',
  'richText',
  'textSpan',
  'icon',
  'image',
  'circleAvatar',
  'card',
  'listTile',
  'expansionTile',
  'divider',
  'verticalDivider',
  'chip',
  'actionChip',
  'badge',
  'tooltip',
  'button',
  'elevatedButton',
  'filledButton',
  'outlinedButton',
  'textButton',
  'iconButton',
  'floatingActionButton',
  'gestureDetector',
  'inkWell',
  'canPop',
  'form',
  'input',
  'textField',
  'textArea',
  'dropdown',
  'checkbox',
  'switch',
  'radio',
  'slider',
  'datePicker',
  'timePicker',
  'loader',
  'circularProgressIndicator',
  'linearProgressIndicator',
  'refreshIndicator',
  'visibility',
  'conditional',
  'repeat',
  'responsive',
  'opacity',
  'animatedOpacity',
  'animatedContainer',
  'animatedSwitcher',
  'transform',
  'ignorePointer',
  'absorbPointer',
  'semantics',
  'theme',
  'alertDialog',
  'bottomSheet',
  'dataTable',
  'stepper',
  'searchField',
  'autocomplete',
  'multiSelect',
  'rangeSlider',
  'rating',
  'dateRangePicker',
  'quantitySelector',
  'customScrollView',
  'sliverAppBar',
  'sliverList',
  'sliverGrid',
  'sliverPadding',
  'sliverToBoxAdapter',
  'sliverFillRemaining',
  'stickyHeader',
  'nestedScrollView',
  'draggableScrollableSheet',
  'imageGallery',
  'timeline',
  'countdown',
  'chart',
  'paginatedList',
  'live',
  'dataView',
  'emptyState',
  'errorState',
  'skeleton',
};

Widget _buildWidget(_NodeBuilder b) {
  final p = b.p;
  final type = b.node.type;
  final onTap =
      p.raw('onPressed') ??
      p.raw('onTap') ??
      p.raw('action') ??
      (p.string('navigateSource') == '/custom' && p.string('pageSrc').isNotEmpty
          ? {
              'type': 'navigate',
              'source': p.string('pageSrc'),
              'refreshOnReturn': true,
            }
          : null);
  Icon icon([String key = 'icon']) => Icon(
    spaceIcons[p.string(key)] ?? Icons.help_outline,
    size: p.number('iconSize', 24),
    color: p.color('iconColor', p.color('color')),
  );
  Widget label() => b.node.child != null
      ? b.child
      : Text(p.string('text', p.string('label')));
  Decoration decoration() => BoxDecoration(
    color: p.color('backgroundColor'),
    borderRadius: p.radius,
    border: p.boolean('border') || p.raw('borderColor') != null
        ? Border.all(
            color: p.color('borderColor', Colors.grey)!,
            width: p.positive('borderWidth', 1),
          )
        : null,
    boxShadow: p.number('elevation', 0)! > 0
        ? [
            BoxShadow(
              color: p.color('shadowColor', const Color(0x22000000))!,
              blurRadius: p.positive('elevation', 0),
            ),
          ]
        : null,
  );
  List<Widget> spaced() {
    final widgets = b.children;
    final spacing = p.positive('spacing', 0);
    if (spacing == 0) return widgets;
    return [
      for (var i = 0; i < widgets.length; i++) ...[
        if (i > 0)
          SizedBox(
            width: type == 'row' ? spacing : 0,
            height: type == 'column' ? spacing : 0,
          ),
        widgets[i],
      ],
    ];
  }

  switch (type) {
    case 'scaffold':
      final appBar = b.slot('appBar');
      return Scaffold(
        appBar: appBar == null
            ? null
            : appBar is PreferredSizeWidget
            ? appBar
            : PreferredSize(
                preferredSize: Size.fromHeight(p.positive('appBarHeight', 56)),
                child: appBar,
              ),
        body: b.slot('body') ?? b.child,
        drawer: b.slot('drawer'),
        endDrawer: b.slot('endDrawer'),
        bottomNavigationBar: b.slot('bottomNavigationBar'),
        floatingActionButton: b.slot('floatingActionButton'),
        bottomSheet: b.slot('bottomSheet'),
        backgroundColor: p.color('backgroundColor'),
        resizeToAvoidBottomInset: p.boolean('resizeToAvoidBottomInset', true),
        extendBody: p.boolean('extendBody'),
      );
    case 'appBar':
      return AppBar(
        title: b.slot('title') ?? Text(p.string('title', p.string('text'))),
        leading: b.slot('leading'),
        actions: b.slots('actions'),
        centerTitle: p.boolean('centerTitle'),
        automaticallyImplyLeading: p.boolean('automaticallyImplyLeading', true),
        backgroundColor: p.color('backgroundColor'),
        foregroundColor: p.color('color'),
        elevation: p.positive('elevation', 0),
        bottom: p.raw('bottom') == null
            ? null
            : PreferredSize(
                preferredSize: Size.fromHeight(p.positive('bottomHeight', 48)),
                child: b.slot('bottom')!,
              ),
      );
    case 'drawer':
      return Drawer(
        backgroundColor: p.color('backgroundColor'),
        width: p.number('width'),
        child: b.node.child != null
            ? b.child
            : ListView(padding: p.insets('padding'), children: b.children),
      );
    case 'navigationBar':
    case 'bottomNavigationBar':
    case 'navigationRail':
      final destinations = p.list('destinations');
      if (destinations.length < 2) {
        throw const FormatException(
          'navigation requires at least two destinations',
        );
      }
      final selectionPath = p.raw('bind') == null
          ? '_navigation.${b.node.id ?? b.node.path}'
          : p.string('bind');
      final current = b.renderer.controller.read(
        selectionPath,
        p.integer('selectedIndex', 0),
      );
      final selected = current is num
          ? current.toInt().clamp(0, destinations.length - 1)
          : 0;
      void select(int index) {
        b.renderer.controller.setValue(selectionPath, index);
        final entry = destinations[index] as Map;
        unawaited(
          b.eventAction(entry['action'] ?? p.raw('onChanged'), {
            'index': index,
            'value': index,
            'item': entry,
          }),
        );
      }
      for (final entry in destinations) {
        if (entry is! Map) {
          throw const FormatException('destination must be an object');
        }
      }
      if (type == 'navigationRail') {
        return NavigationRail(
          selectedIndex: selected,
          onDestinationSelected: select,
          extended: p.boolean('extended'),
          destinations: [
            for (final entry in destinations)
              NavigationRailDestination(
                icon: Icon(spaceIcons[entry['icon']] ?? Icons.circle_outlined),
                label: Text('${entry['label'] ?? ''}'),
              ),
          ],
        );
      }
      if (p.string('destinationStyle') == 'pill') {
        final scheme = Theme.of(b.context).colorScheme;
        return Material(
          color: p.color('backgroundColor', scheme.surface),
          child: SafeArea(
            top: false,
            child: SizedBox(
              height: p.number('height', 70),
              child: Row(
                children: [
                  for (var i = 0; i < destinations.length; i++)
                    Expanded(
                      child: Semantics(
                        role: SemanticsRole.tab,
                        selected: selected == i,
                        label: '${destinations[i]['label'] ?? ''}',
                        child: InkWell(
                          onTap: () => select(i),
                          borderRadius: BorderRadius.circular(40),
                          child: Container(
                            margin: const EdgeInsets.symmetric(horizontal: 2),
                            padding: const EdgeInsets.symmetric(vertical: 8),
                            decoration: BoxDecoration(
                              color: selected == i
                                  ? p.color(
                                      'indicatorColor',
                                      scheme.primaryContainer,
                                    )
                                  : Colors.transparent,
                              borderRadius: BorderRadius.circular(40),
                            ),
                            child: ExcludeSemantics(
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(
                                    spaceIcons[destinations[i][selected == i
                                                ? 'selectedIcon'
                                                : 'icon'] ??
                                            destinations[i]['icon']] ??
                                        Icons.circle_outlined,
                                    size: p.number('iconSize', 24),
                                    color: selected == i
                                        ? p.color(
                                            'selectedColor',
                                            scheme.primary,
                                          )
                                        : p.color('color', scheme.onSurface),
                                  ),
                                  const SizedBox(height: 3),
                                  Text(
                                    '${destinations[i]['label'] ?? ''}',
                                    style: TextStyle(
                                      fontSize: p.number('fontSize', 12),
                                      fontWeight: selected == i
                                          ? FontWeight.w700
                                          : FontWeight.w500,
                                      color: selected == i
                                          ? p.color(
                                              'selectedColor',
                                              scheme.primary,
                                            )
                                          : p.color('color', scheme.onSurface),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        );
      }
      return NavigationBar(
        selectedIndex: selected,
        onDestinationSelected: select,
        backgroundColor: p.color('backgroundColor'),
        indicatorColor: p.color('indicatorColor'),
        height: p.number('height'),
        destinations: [
          for (final entry in destinations)
            NavigationDestination(
              icon: Icon(spaceIcons[entry['icon']] ?? Icons.circle_outlined),
              selectedIcon: Icon(
                spaceIcons[entry['selectedIcon'] ?? entry['icon']] ??
                    Icons.circle,
              ),
              label: '${entry['label'] ?? ''}',
            ),
        ],
      );
    case 'defaultTabController':
      final length = p.integer('length', 0);
      if (length <= 0) {
        throw const FormatException('tab length must be positive');
      }
      final index = p.integer('initialIndex', 0);
      if (index < 0 || index >= length) {
        throw const FormatException('initialIndex is outside tab bounds');
      }
      return DefaultTabController(
        length: length,
        initialIndex: index,
        child: b.child,
      );
    case 'tabBar':
      return _SpaceTabBar(builder: b);
    case 'tabBarView':
      return TabBarView(children: b.children);
    case 'tab':
      return Tab(
        text: p.get('text') as String?,
        icon: p.raw('icon') == null ? null : icon(),
        child: b.node.child == null ? null : b.child,
      );
    case 'safeArea':
      return SafeArea(
        top: p.boolean('top', true),
        bottom: p.boolean('bottom', true),
        left: p.boolean('left', true),
        right: p.boolean('right', true),
        child: b.child,
      );
    case 'container':
      return Container(
        width: p.number('width'),
        height: p.number('height'),
        padding: p.insets('padding'),
        margin: p.insets('margin'),
        alignment: p.raw('alignment') == null ? null : p.alignment,
        decoration: decoration(),
        child: b.node.child == null ? null : b.child,
      );
    case 'animatedContainer':
      return AnimatedContainer(
        duration: Duration(milliseconds: p.integer('duration', 250)),
        width: p.number('width'),
        height: p.number('height'),
        padding: p.insets('padding'),
        margin: p.insets('margin'),
        decoration: decoration(),
        child: b.child,
      );
    case 'padding':
      return Padding(padding: p.insets('padding'), child: b.child);
    case 'center':
      return Center(child: b.child);
    case 'align':
      return Align(alignment: p.alignment, child: b.child);
    case 'sizedBox':
      return SizedBox(
        width: p.number('width'),
        height: p.number('height'),
        child: b.node.child == null ? null : b.child,
      );
    case 'sizedBoxFill':
      return SizedBox.expand(child: b.child);
    case 'row':
      return Row(
        mainAxisAlignment: p.mainAxis,
        crossAxisAlignment: p.crossAxis,
        mainAxisSize: p.string('mainAxisSize') == 'min'
            ? MainAxisSize.min
            : MainAxisSize.max,
        children: spaced(),
      );
    case 'column':
      return Column(
        mainAxisAlignment: p.mainAxis,
        crossAxisAlignment: p.crossAxis,
        mainAxisSize: p.string('mainAxisSize') == 'min'
            ? MainAxisSize.min
            : MainAxisSize.max,
        children: spaced(),
      );
    case 'stack':
      return Stack(
        alignment: p.alignment,
        clipBehavior: p.boolean('clip', true) ? Clip.hardEdge : Clip.none,
        children: b.children,
      );
    case 'positioned':
      return Positioned(
        top: p.number('top'),
        left: p.number('left'),
        right: p.number('right'),
        bottom: p.number('bottom'),
        width: p.number('width'),
        height: p.number('height'),
        child: b.child,
      );
    case 'expanded':
      return Expanded(flex: _positiveInt(p, 'flex', 1), child: b.child);
    case 'flexible':
      return Flexible(
        flex: _positiveInt(p, 'flex', 1),
        fit: p.string('fit') == 'tight' ? FlexFit.tight : FlexFit.loose,
        child: b.child,
      );
    case 'spacer':
      return Spacer(flex: _positiveInt(p, 'flex', 1));
    case 'wrap':
      return Wrap(
        direction: p.axis,
        spacing: p.positive('spacing', 0),
        runSpacing: p.positive('runSpacing', 0),
        children: b.children,
      );
    case 'singleChildScrollView':
      return SingleChildScrollView(
        scrollDirection: p.axis,
        padding: p.insets('padding'),
        physics: const AlwaysScrollableScrollPhysics(),
        child: b.child,
      );
    case 'listView':
      return ListView.builder(
        padding: p.insets('padding'),
        shrinkWrap: p.boolean('shrinkWrap'),
        primary: p.boolean('primary'),
        scrollDirection: p.axis,
        itemExtent: p.number('itemExtent'),
        physics: p.boolean('scrollable', true)
            ? const AlwaysScrollableScrollPhysics()
            : const NeverScrollableScrollPhysics(),
        itemCount: b.node.children.length,
        itemBuilder: (context, index) => b.renderer.render(
          b.node.children[index],
          context,
          formId: b.formId,
          depth: b.depth + 1,
        ),
      );
    case 'gridView':
      return GridView.builder(
        padding: p.insets('padding'),
        shrinkWrap: p.boolean('shrinkWrap'),
        primary: p.boolean('primary'),
        physics: p.boolean('scrollable', true)
            ? null
            : const NeverScrollableScrollPhysics(),
        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: _positiveInt(p, 'crossAxisCount', 2),
          crossAxisSpacing: p.positive('crossAxisSpacing', 8),
          mainAxisSpacing: p.positive('mainAxisSpacing', 8),
          childAspectRatio: p.positive('childAspectRatio', 1, zero: false),
          mainAxisExtent: p.raw('mainAxisExtent') == null
              ? null
              : p.positive('mainAxisExtent', 1, zero: false),
        ),
        itemCount: b.node.children.length,
        itemBuilder: (context, index) => b.renderer.render(
          b.node.children[index],
          context,
          formId: b.formId,
          depth: b.depth + 1,
        ),
      );
    case 'pageView':
      return PageView(
        scrollDirection: p.axis,
        children: b.children,
        onPageChanged: (index) {
          if (p.raw('bind') != null) {
            b.renderer.controller.setValue(p.string('bind'), index);
          }
          unawaited(b.action(p.raw('onChanged')));
        },
      );
    case 'aspectRatio':
      return AspectRatio(
        aspectRatio: p.positive('aspectRatio', 1, zero: false),
        child: b.child,
      );
    case 'constrainedBox':
      final minWidth = p.positive('minWidth', 0),
          minHeight = p.positive('minHeight', 0);
      final maxWidth = p.number('maxWidth', double.infinity)!,
          maxHeight = p.number('maxHeight', double.infinity)!;
      if (maxWidth < minWidth || maxHeight < minHeight) {
        throw const FormatException(
          'maximum constraints must be at least minimum constraints',
        );
      }
      return ConstrainedBox(
        constraints: BoxConstraints(
          minWidth: minWidth,
          minHeight: minHeight,
          maxWidth: maxWidth,
          maxHeight: maxHeight,
        ),
        child: b.child,
      );
    case 'fractionallySizedBox':
      return FractionallySizedBox(
        widthFactor: p.number('widthFactor'),
        heightFactor: p.number('heightFactor'),
        alignment: p.alignment,
        child: b.child,
      );
    case 'clipRRect':
      return ClipRRect(borderRadius: p.radius, child: b.child);
    case 'clipOval':
      return ClipOval(child: b.child);
    case 'fittedBox':
      return FittedBox(fit: p.fit, alignment: p.alignment, child: b.child);
    case 'customWidget':
      return Padding(
        padding: const EdgeInsets.all(16),
        child: Text(
          'Custom widget: ${p.string('name')} — compile and register this builder in the Flutter host.',
        ),
      );
    case 'text':
      return Text(
        p.boolean('literal') ? '${p.raw('text') ?? ''}' : p.string('text'),
        style: p.textStyle,
        textAlign: p.textAlign,
        maxLines: p.raw('maxLines') == null
            ? null
            : _positiveInt(p, 'maxLines', 1),
        overflow: p.raw('maxLines') == null ? null : TextOverflow.ellipsis,
      );
    case 'selectableText':
      return SelectableText(
        p.boolean('literal') ? '${p.raw('text') ?? ''}' : p.string('text'),
        style: p.textStyle,
        textAlign: p.textAlign,
      );
    case 'richText':
    case 'textSpan':
      return Text.rich(
        TextSpan(
          text: p.string('text'),
          style: p.textStyle,
          children: [
            for (final node in b.node.children)
              _textSpan(node, b.renderer.controller, b.context),
          ],
        ),
        textAlign: p.textAlign,
      );
    case 'icon':
      return Icon(
        spaceIcons[p.string('name', p.string('icon'))] ?? Icons.help_outline,
        size: p.number('size', 24),
        color: p.color('color'),
        semanticLabel: p.get('semanticLabel') as String?,
      );
    case 'image':
      final src = p.string('src');
      final error = b.slot('error');
      Widget errorBuilder(
        BuildContext context,
        Object error,
        StackTrace? stack,
      ) {
        b.renderer.reportIssue(
          SpaceIssue(
            '${b.node.path}.src',
            'Unable to load image. Use a direct image URL with browser CORS access, an uploaded image, or a bundled asset.',
          ),
        );
        return b.slot('error') ??
            const Tooltip(
              message: 'Image could not be loaded. Check its source and network access.',
              child: Icon(Icons.broken_image_outlined),
            );
      }
      if (p.string('source', 'network') == 'asset') {
        return Image.asset(
          src,
          package: p.get('package') as String?,
          width: p.number('width'),
          height: p.number('height'),
          fit: p.fit,
          errorBuilder: errorBuilder,
        );
      }
      if (src.isEmpty) return error ?? const Icon(Icons.broken_image_outlined);
      if (src.startsWith('data:')) {
        return Image.memory(
          _decodeInlineImage(src),
          width: p.number('width'),
          height: p.number('height'),
          fit: p.fit,
          semanticLabel: p.get('semanticLabel') as String?,
          errorBuilder: errorBuilder,
        );
      }
      return Image.network(
        src,
        width: p.number('width'),
        height: p.number('height'),
        fit: p.fit,
        errorBuilder: errorBuilder,
        loadingBuilder: (context, child, progress) => progress == null
            ? child
            : SizedBox(
                width: p.number('width'),
                height: p.number('height', 120),
                child: const Center(child: CircularProgressIndicator()),
              ),
      );
    case 'circleAvatar':
      return CircleAvatar(
        radius: p.number('radius', 24),
        backgroundColor: p.color('backgroundColor'),
        backgroundImage: p.raw('src') == null
            ? null
            : NetworkImage(p.string('src')),
        child: b.node.child != null ? b.child : Text(p.string('text')),
      );
    case 'card':
      return Card(
        color: p.color('backgroundColor'),
        elevation: p.positive('elevation', 1),
        margin: p.insets('margin', 4),
        shape: p.raw('borderRadius') == null
            ? null
            : RoundedRectangleBorder(borderRadius: p.radius),
        child: b.child,
      );
    case 'listTile':
      return ListTile(
        title: b.slot('title') ?? Text(p.string('title', p.string('text'))),
        subtitle:
            b.slot('subtitle') ??
            (p.raw('subtitle') is String ? Text(p.string('subtitle')) : null),
        leading: b.slot('leading') ?? (p.raw('icon') == null ? null : icon()),
        trailing: b.slot('trailing'),
        selected: p.boolean('selected'),
        enabled: p.boolean('enabled', true),
        onTap: onTap == null ? null : () => b.action(onTap),
      );
    case 'expansionTile':
      return ExpansionTile(
        title: Text(p.string('title', p.string('text'))),
        initiallyExpanded: p.boolean('initiallyExpanded'),
        leading: b.slot('leading'),
        children: b.children,
      );
    case 'divider':
      return Divider(
        height: p.number('height'),
        thickness: p.number('thickness'),
        color: p.color('color'),
      );
    case 'verticalDivider':
      return VerticalDivider(
        width: p.number('width'),
        thickness: p.number('thickness'),
        color: p.color('color'),
      );
    case 'chip':
      return Chip(
        label: label(),
        avatar: b.slot('avatar'),
        backgroundColor: p.color('backgroundColor'),
      );
    case 'actionChip':
      return ActionChip(
        label: label(),
        onPressed: p.boolean('enabled', true) ? () => b.action(onTap) : null,
      );
    case 'badge':
      return Badge(
        label: Text(p.string('text')),
        isLabelVisible: p.boolean('visible', true),
        child: b.child,
      );
    case 'tooltip':
      return Tooltip(
        message: p.string('message', p.string('text')),
        child: b.child,
      );
    case 'button':
    case 'elevatedButton':
    case 'filledButton':
    case 'outlinedButton':
    case 'textButton':
      return Builder(
        builder: (context) => _ActionButton(
          type: type,
          enabled: p.boolean('enabled', true) && onTap != null,
          onPressed: () => b.action(onTap, context),
          style: ButtonStyle(
            backgroundColor: p.raw('backgroundColor') == null
                ? null
                : WidgetStatePropertyAll(p.color('backgroundColor')),
            foregroundColor: p.raw('color') == null
                ? null
                : WidgetStatePropertyAll(p.color('color')),
            side: p.raw('borderColor') == null
                ? null
                : WidgetStatePropertyAll(
                    BorderSide(
                      color: p.color('borderColor')!,
                      width: p.positive('borderWidth', 1),
                    ),
                  ),
            padding: p.raw('padding') == null
                ? null
                : WidgetStatePropertyAll(p.insets('padding')),
            shape: p.raw('borderRadius') == null
                ? null
                : WidgetStatePropertyAll(
                    RoundedRectangleBorder(borderRadius: p.radius),
                  ),
          ),
          child: label(),
        ),
      );
    case 'iconButton':
      return IconButton(
        icon: icon(),
        padding: p.raw('padding') == null ? null : p.insets('padding'),
        tooltip: p.get('tooltip') as String?,
        onPressed: p.boolean('enabled', true) && onTap != null
            ? () => b.action(onTap)
            : null,
      );
    case 'floatingActionButton':
      return FloatingActionButton(
        heroTag: b.node.id ?? b.node.path,
        backgroundColor: p.color('backgroundColor'),
        onPressed: onTap == null ? null : () => b.action(onTap),
        child: b.node.child != null ? b.child : icon(),
      );
    case 'gestureDetector':
      return GestureDetector(
        onTap: () => b.action(onTap),
        onLongPress: p.raw('onLongPress') == null
            ? null
            : () => b.action(p.raw('onLongPress')),
        child: b.child,
      );
    case 'inkWell':
      return InkWell(
        onTap: onTap == null ? null : () => b.action(onTap),
        borderRadius: p.radius,
        child: b.child,
      );
    case 'canPop':
      return GestureDetector(
        onTap: () => b.action({'type': 'pop'}),
        child: b.child,
      );
    case 'searchField':
    case 'autocomplete':
    case 'multiSelect':
    case 'rangeSlider':
    case 'rating':
    case 'dateRangePicker':
      return _buildField(b);
    case 'form':
      return _buildForm(b);
    case 'input':
    case 'textField':
    case 'textArea':
    case 'dropdown':
    case 'checkbox':
    case 'switch':
    case 'radio':
    case 'slider':
    case 'datePicker':
    case 'timePicker':
      return _buildField(b);
    case 'loader':
    case 'circularProgressIndicator':
      return CircularProgressIndicator(
        value: p.number('value'),
        color: p.color('color'),
        strokeWidth: p.positive('strokeWidth', 4),
      );
    case 'linearProgressIndicator':
      return LinearProgressIndicator(
        value: p.number('value'),
        color: p.color('color'),
        backgroundColor: p.color('backgroundColor'),
        minHeight: p.number('height'),
      );
    case 'refreshIndicator':
      return RefreshIndicator(
        onRefresh: () =>
            b.action(p.raw('onRefresh') ?? const {'type': 'refresh'}),
        child: b.child,
      );
    case 'visibility':
      return Visibility(
        visible: p.boolean('visible', true),
        maintainState: p.boolean('maintainState'),
        child: b.child,
      );
    case 'conditional':
      return p.boolean('condition')
          ? (b.slot('then') ?? b.child)
          : (b.slot('else') ?? const SizedBox.shrink());
    case 'repeat':
      return _repeat(b);
    case 'responsive':
      return LayoutBuilder(
        builder: (context, constraints) {
          final name =
              constraints.maxWidth >= p.positive('largeBreakpoint', 1024)
              ? 'large'
              : constraints.maxWidth >= p.positive('mediumBreakpoint', 600)
              ? 'medium'
              : 'small';
          final value = p.raw(name) ?? p.raw('small');
          if (value == null) return b.child;
          return b.renderer.renderJson(
            value,
            context,
            path: '${b.node.path}.$name',
            formId: b.formId,
            depth: b.depth + 1,
          );
        },
      );
    case 'opacity':
      return Opacity(opacity: _unit(p, 'opacity', 1), child: b.child);
    case 'animatedOpacity':
      return AnimatedOpacity(
        opacity: _unit(p, 'opacity', 1),
        duration: Duration(milliseconds: p.integer('duration', 250)),
        child: b.child,
      );
    case 'animatedSwitcher':
      return AnimatedSwitcher(
        duration: Duration(milliseconds: p.integer('duration', 250)),
        child: b.child,
      );
    case 'transform':
      return Transform.rotate(
        angle: p.number('angle', 0)!,
        alignment: p.alignment,
        child: Transform.scale(scale: p.number('scale', 1), child: b.child),
      );
    case 'ignorePointer':
      return IgnorePointer(
        ignoring: p.boolean('ignoring', true),
        child: b.child,
      );
    case 'absorbPointer':
      return AbsorbPointer(
        absorbing: p.boolean('absorbing', true),
        child: b.child,
      );
    case 'semantics':
      return Semantics(
        label: p.get('label') as String?,
        button: p.boolean('button'),
        liveRegion: p.boolean('liveRegion'),
        child: b.child,
      );
    case 'theme':
      return Theme(data: _spaceTheme(p.values, b.context), child: b.child);
    case 'alertDialog':
      return AlertDialog(
        title: p.raw('title') is String
            ? Text(p.string('title'))
            : b.slot('title'),
        content:
            b.slot('content') ??
            (b.node.child == null ? Text(p.string('text')) : b.child),
        actions: b.slots('actions'),
      );
    case 'bottomSheet':
      return Material(
        color: p.color('backgroundColor'),
        borderRadius: p.radius,
        child: SafeArea(
          child: Padding(padding: p.insets('padding', 16), child: b.child),
        ),
      );
    case 'dataTable':
      return _InteractiveTable(builder: b);
    case 'stepper':
      return _stepper(b);
    default:
      return _advancedWidget(b);
  }
}

int _positiveInt(_Props p, String key, int fallback) {
  final value = p.integer(key, fallback);
  if (value <= 0) throw FormatException('$key must be positive');
  return value;
}

double _unit(_Props p, String key, double fallback) {
  final value = p.number(key, fallback)!;
  if (value < 0 || value > 1) {
    throw FormatException('$key must be between zero and one');
  }
  return value;
}

int _selectedIndex(_Props p, int length) {
  final value = p.raw('bind') == null
      ? p.get('selectedIndex', 0)
      : p.controller.read(p.string('bind'), 0);
  if (value is! int || value < 0 || value >= length) {
    throw const FormatException('selected index is outside destination bounds');
  }
  return value;
}

TextSpan _textSpan(
  SpaceNode node,
  SpaceController controller,
  BuildContext context,
) {
  final p = _Props(node.props, controller, context);
  return TextSpan(
    text: p.string('text'),
    style: p.textStyle,
    children: node.children
        .map((child) => _textSpan(child, controller, context))
        .toList(),
  );
}

class _ActionButton extends StatefulWidget {
  final String type;
  final bool enabled;
  final Future<void> Function() onPressed;
  final ButtonStyle style;
  final Widget child;
  const _ActionButton({
    required this.type,
    required this.enabled,
    required this.onPressed,
    required this.style,
    required this.child,
  });
  @override
  State<_ActionButton> createState() => _ActionButtonState();
}

class _ActionButtonState extends State<_ActionButton> {
  bool _busy = false;
  Future<void> _press() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await widget.onPressed();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final callback = widget.enabled && !_busy ? _press : null;
    final child = _busy && (ModalRoute.of(context)?.isCurrent ?? true)
        ? const SizedBox.square(
            dimension: 18,
            child: CircularProgressIndicator(strokeWidth: 2),
          )
        : widget.child;
    return switch (widget.type) {
      'outlinedButton' => OutlinedButton(
        onPressed: callback,
        style: widget.style,
        child: child,
      ),
      'textButton' => TextButton(
        onPressed: callback,
        style: widget.style,
        child: child,
      ),
      'filledButton' => FilledButton(
        onPressed: callback,
        style: widget.style,
        child: child,
      ),
      _ => ElevatedButton(
        onPressed: callback,
        style: widget.style,
        child: child,
      ),
    };
  }
}

Widget _repeat(_NodeBuilder b) {
  final items = b.p.list('items');
  final template = b.p.raw('template');
  if (template is! Map<String, dynamic>) {
    throw const FormatException('repeat.template must be a widget object');
  }
  final layout = b.p.string('layout', 'list');
  if (layout != 'list' && layout != 'grid') {
    throw const FormatException('repeat.layout must be list or grid');
  }
  if (items.isEmpty && b.p.raw('empty') != null) return b.slot('empty')!;
  final shrink = b.p.boolean('shrinkWrap', true);
  Widget itemBuilder(BuildContext context, int index) {
    final expanded =
        _expandTemplate(template, items[index], index) as Map<String, dynamic>;
    return b.renderer.renderJson(
      expanded,
      context,
      path: '${b.node.path}.items[$index]',
      formId: b.formId,
      depth: b.depth + 1,
    );
  }

  if (layout == 'grid') {
    return GridView.builder(
      shrinkWrap: shrink,
      primary: false,
      physics: shrink
          ? const NeverScrollableScrollPhysics()
          : const AlwaysScrollableScrollPhysics(),
      padding: b.p.insets('padding'),
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: _positiveInt(b.p, 'crossAxisCount', 2),
        crossAxisSpacing: b.p.positive('crossAxisSpacing', 12),
        mainAxisSpacing: b.p.positive('mainAxisSpacing', 12),
        childAspectRatio: b.p.positive('childAspectRatio', 1, zero: false),
        mainAxisExtent: b.p.raw('mainAxisExtent') == null
            ? null
            : b.p.positive('mainAxisExtent', 1, zero: false),
      ),
      itemCount: items.length,
      itemBuilder: itemBuilder,
    );
  }
  return ListView.builder(
    shrinkWrap: shrink,
    primary: false,
    physics: shrink
        ? const NeverScrollableScrollPhysics()
        : const AlwaysScrollableScrollPhysics(),
    padding: b.p.insets('padding'),
    itemCount: items.length,
    itemBuilder: itemBuilder,
  );
}

dynamic _expandTemplate(dynamic value, dynamic item, int index) {
  if (value is Map<String, dynamic>) {
    return value.map((k, v) => MapEntry(k, _expandTemplate(v, item, index)));
  }
  if (value is List) {
    return value.map((v) => _expandTemplate(v, item, index)).toList();
  }
  if (value is! String) return value;
  dynamic read(String path) {
    if (path == 'index') return index;
    if (path == 'item') return item;
    dynamic result = item;
    for (final part in path.substring(5).split('.')) {
      result = result is Map ? result[part] : null;
    }
    return result;
  }

  final regex = RegExp(r'\{\{\s*(item(?:\.[^{}]+)?|index)\s*\}\}');
  final exact = regex.firstMatch(value);
  if (exact != null && exact.start == 0 && exact.end == value.length) {
    return read(exact.group(1)!.trim());
  }
  return value.replaceAllMapped(
    regex,
    (m) => '${read(m.group(1)!.trim()) ?? ''}',
  );
}

Widget _stepper(_NodeBuilder b) {
  final steps = b.p.list('steps');
  if (steps.isEmpty) throw const FormatException('stepper requires steps');
  final current = _selectedIndex(b.p, steps.length);
  void select(int index) {
    if (b.p.raw('bind') != null) {
      b.renderer.controller.setValue(b.p.string('bind'), index);
    }
    unawaited(b.action(b.p.raw('onChanged')));
  }

  return Stepper(
    currentStep: current,
    type: b.p.axis == Axis.horizontal
        ? StepperType.horizontal
        : StepperType.vertical,
    onStepTapped: select,
    onStepContinue: current < steps.length - 1
        ? () => select(current + 1)
        : () => b.action(b.p.raw('onComplete')),
    onStepCancel: current > 0 ? () => select(current - 1) : null,
    steps: [
      for (var i = 0; i < steps.length; i++)
        if (steps[i] is Map<String, dynamic>)
          Step(
            title: Text('${steps[i]['title'] ?? ''}'),
            isActive: i <= current,
            content: steps[i]['content'] is Map<String, dynamic>
                ? b.render(
                    SpaceNode.fromJson(
                      steps[i]['content'],
                      path: '${b.node.path}.steps[$i].content',
                    ),
                  )
                : const SizedBox.shrink(),
          )
        else
          throw const FormatException('step must be an object'),
    ],
  );
}

ThemeData _spaceTheme(Map<String, dynamic> data, BuildContext context) =>
    buildSpaceTheme(
      {
        ...data,
        'fontFamily': resolveSpaceFontFamily(
          context,
          data['fontFamily'] as String?,
        ),
      },
      brightness: data['brightness'] == 'dark'
          ? Brightness.dark
          : Brightness.light,
    );

/// The tab controller reports both taps and swipes. Keep binding and actions in
/// one listener so a tap never executes the same request twice.
class _SpaceTabBar extends StatefulWidget {
  final _NodeBuilder builder;
  const _SpaceTabBar({required this.builder});
  @override
  State<_SpaceTabBar> createState() => _SpaceTabBarState();
}

class _SpaceTabBarState extends State<_SpaceTabBar> {
  TabController? _tabs;
  int? _last;
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final tabs = DefaultTabController.maybeOf(context);
    if (tabs == null) {
      throw StateError('Place Tab Bar inside a Default Tab Controller');
    }
    if (_tabs != tabs) {
      _tabs?.removeListener(_changed);
      _tabs = tabs;
      _last = tabs.index;
      tabs.addListener(_changed);
    }
  }

  void _changed() {
    final index = _tabs!.index;
    if (_last == index) return;
    _last = index;
    final b = widget.builder;
    final bind = b.p.raw('bind');
    if (bind != null) b.renderer.controller.setValue('$bind', index);
    unawaited(
      b.eventAction(b.p.raw('onChanged'), {
        'index': index,
        'value': index,
      }, context),
    );
  }

  @override
  Widget build(BuildContext context) {
    final b = widget.builder;
    final bind = b.p.raw('bind');
    final bound = bind == null ? null : b.renderer.controller.read('$bind');
    if (bound is num &&
        bound.toInt() == bound &&
        bound >= 0 &&
        bound < _tabs!.length &&
        bound != _tabs!.index) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && bound != _tabs!.index) _tabs!.animateTo(bound.toInt());
      });
    }
    return TabBar(isScrollable: b.p.boolean('isScrollable'), tabs: b.children);
  }

  @override
  void dispose() {
    _tabs?.removeListener(_changed);
    super.dispose();
  }
}
