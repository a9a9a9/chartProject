(function (factory) {
  if (typeof define === 'function' && define.amd) {
    define(['jquery'], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('jquery'));
  } else {
    factory(window.jQuery);
  }
}(function ($) {
  'use strict';

  var pluginName = 'customGantt';
  var instanceCount = 0;
  var rowAnimationMs = 120;
  // 역방향 선이 대상 bar 왼쪽으로 빠져나가는 거리와 bar 좌우 여백.
  // 두 값으로 "선이 차트 왼쪽 밖으로 나가는지"를 판정하므로 그리기 쪽과 반드시 같이 쓴다.
  var dependencyDetourLead = 14;
  var taskBarInset = 3;
  // 후행선이 타는 세로선의 여유. 선행선 스텁(14)과 값을 달리해 세로선이 겹치지 않게 한다.
  var afterDependencyGap = 22;
  var colorThemes = {
    default: ['#2563eb', '#0891b2', '#16a34a', '#7c3aed', '#ea580c', '#dc2626']
  };
  var monthShortNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // currentLanguage 가 'ko' 면 한국어, 그 밖의 값은 모두 영어로 떨어진다.
  var translations = {
    ko: {
      emptyData: '표시할 일정 데이터가 없습니다.',
      sidebarHeader: '분류 / 작업',
      toggleRow: '분류 접기/펼치기',
      showSidebar: '분류 영역 보이기',
      hideSidebar: '분류 영역 숨기기',
      expandAll: '전체 펼치기',
      collapseAll: '전체 접기',
      close: '닫기',
      scheduleName: '일정명',
      startDate: '시작일',
      endDate: '종료일',
      status: '상태',
      progress: '진행률',
      color: '색상',
      type: '유형',
      period: '기간',
      summaryTask: '요약 일정',
      normalTask: '작업 일정',
      largeGroup: '대분류',
      mediumGroup: '중분류',
      smallTask: '작업',
      leadTimeOver: '리드타임(L/T) {days}일 기준 {diff}일 초과',
      leadTimeUnder: '리드타임(L/T) {days}일 기준 {diff}일 여유',
      leadTimeBadge: '{base} · 진행률 {progress}% ({level})',
      leadTimeMarker: 'L/T 기준({days}일): {date}까지',
      overrun: '계획 종료 {days}일 초과 · 진행률 {progress}% ({level})',
      levelSafe: '정상',
      levelWarning: '주의',
      levelDelay: '지연',
      monthLabel: '{month}월',
      weekLabel: '{month}/{day}주'
    },
    en: {
      emptyData: 'No schedule data to display.',
      sidebarHeader: 'Category / Task',
      toggleRow: 'Collapse or expand category',
      showSidebar: 'Show category panel',
      hideSidebar: 'Hide category panel',
      expandAll: 'Expand all',
      collapseAll: 'Collapse all',
      close: 'Close',
      scheduleName: 'Name',
      startDate: 'Start',
      endDate: 'End',
      status: 'Status',
      progress: 'Progress',
      color: 'Color',
      type: 'Type',
      period: 'Period',
      summaryTask: 'Summary',
      normalTask: 'Task',
      largeGroup: 'Group',
      mediumGroup: 'Subgroup',
      smallTask: 'Task',
      leadTimeOver: '{diff} days over the {days}-day lead time (L/T)',
      leadTimeUnder: '{diff} days under the {days}-day lead time (L/T)',
      leadTimeBadge: '{base} · Progress {progress}% ({level})',
      leadTimeMarker: 'L/T baseline ({days} days): through {date}',
      overrun: '{days} days past the planned end · Progress {progress}% ({level})',
      levelSafe: 'On track',
      levelWarning: 'Warning',
      levelDelay: 'Delayed',
      monthLabel: '{monthName}',
      weekLabel: '{month}/{day}'
    }
  };

  function normalizeLanguage(value) {
    return value === 'ko' ? 'ko' : 'en';
  }

  function translate(options, key, params) {
    var dict = translations[normalizeLanguage(options && options.currentLanguage)];
    var text = dict[key];

    if (text === undefined) {
      return key;
    }

    if (!params) {
      return text;
    }

    return text.replace(/\{(\w+)\}/g, function (match, name) {
      return params[name] === undefined ? match : params[name];
    });
  }
  var defaults = {
    data: [],
    title: 'Project Gantt',
    startDate: null,
    endDate: null,
    dayWidth: 34,
    weekWidth: 92,
    monthWidth: 132,
    rowHeight: 42,
    locale: 'ko-KR',
    currentLanguage: 'ko',
    showToday: true,
    viewMode: 'day',
    initialCenterDate: null,
    initialCollapsed: false,
    initialExpandLevel: null,
    excludeWeekends: false,
    colorTheme: 'default',
    ignoreDataColors: false,
    colorRenderer: null,
    barLabelRenderer: null,
    showDpndLines: false,
    dpndLeadWidth: 30,
    leadTimeField: 'expectDays',
    showLeadTimeLine: false
  };

  function CustomGantt(element, options) {
    this.$element = $(element);
    this.eventNamespace = '.' + pluginName + instanceCount;
    this.modalEventNamespace = '.modal' + pluginName + instanceCount;
    this.dependencyArrowId = 'cg-dependency-arrow-' + instanceCount;
    instanceCount += 1;
    this.options = $.extend({}, defaults, options);
    this.rows = [];
    this.units = [];
    this.collapsed = {};
    this.initialStateApplied = false;
    this.initialScrollApplied = false;
    this.pendingScrollPosition = null;
    this.sidebarCollapsed = false;
    this.enteringRowIds = {};
    this.activeDependencyRowId = null;
    this.backwardDependencies = [];
    this.hasBackwardDependency = false;
    this.init();
  }

  CustomGantt.prototype.init = function () {
    this.rows = flattenRows(this.options.data, this.options);
    this.applyInitialCollapsedState();
    this.units = buildUnits(this.options, this.rows);
    // 좌표로 판정하므로 units 가 만들어진 뒤에 계산한다.
    this.backwardDependencies = collectBackwardDependencies(this.rows, this.units, getUnitWidth(this.options));
    this.hasBackwardDependency = this.backwardDependencies.length > 0;
    this.render();
  };

  // 역방향 선이 있을 때만 첫 셀을 넓혀 선이 왼쪽으로 빠져나갈 여유를 만든다.
  CustomGantt.prototype.getDependencyLead = function () {
    if (!this.options.showDpndLines || !this.hasBackwardDependency) {
      return 0;
    }

    return Math.max(Number(this.options.dpndLeadWidth) || 0, 0);
  };

  CustomGantt.prototype.update = function (options) {
    this.options = $.extend({}, this.options, options);
    this.init();
  };

  CustomGantt.prototype.destroy = function () {
    $(document).off(this.eventNamespace);
    $(document).off(this.modalEventNamespace);
    this.closeTaskContextMenu();
    this.hideTaskTooltip();
    this.closeDetailModal();
    this.$element.removeData(pluginName).empty().removeClass('custom-gantt');
  };

  CustomGantt.prototype.expandAll = function () {
    this.rememberScrollPosition();
    this.collapsed = {};
    this.render();
  };

  CustomGantt.prototype.collapseAll = function () {
    var self = this;

    this.rememberScrollPosition();
    this.rows.forEach(function (row) {
      if (row.type !== 'small') {
        self.collapsed[row.id] = true;
      }
    });
    this.render();
  };

  CustomGantt.prototype.expandToLevel = function (level) {
    this.rememberScrollPosition();
    this.applyCollapsedLevel(level);
    this.render();
  };

  CustomGantt.prototype.applyInitialCollapsedState = function () {
    if (this.initialStateApplied) {
      return;
    }

    this.applyCollapsedLevel(getInitialExpandLevel(this.options));

    this.initialStateApplied = true;
  };

  CustomGantt.prototype.applyCollapsedLevel = function (level) {
    var self = this;
    var targetDepth = {
      large: 1,
      medium: 2,
      small: 3
    }[level] || 3;

    this.collapsed = {};
    this.rows.forEach(function (row) {
      if (row.type === 'large') {
        self.collapsed[row.id] = targetDepth <= 1;
      }

      if (row.type === 'medium') {
        self.collapsed[row.id] = targetDepth <= 2;
      }
    });
  };

  CustomGantt.prototype.render = function () {
    var opts = this.options;
    this.$element
      .empty()
      .addClass('custom-gantt')
      .toggleClass('is-sidebar-collapsed', this.sidebarCollapsed)
      .toggleClass('has-dependency-lines', !!opts.showDpndLines)
      .toggleClass('has-backward-dependency', this.hasBackwardDependency);

    if (!this.rows.length || !this.units.length) {
      this.$element.append($('<div class="cg-empty">').text(translate(opts, 'emptyData')));
      return;
    }

    var visibleRows = getVisibleRows(this.rows, this.collapsed);
    var enteringRowIds = this.enteringRowIds;
    var unitWidth = getUnitWidth(opts);
    var $toolbar = $('<div class="cg-toolbar">');
    var $title = $('<h2 class="cg-title">').text(opts.title);
    var $range = $('<div class="cg-range">').text(formatDate(this.units[0].start, opts.locale) + ' - ' + formatDate(this.units[this.units.length - 1].end, opts.locale));
    var $scroll = $('<div class="cg-scroll">');
    var $board = $('<div class="cg-board">');
    var $sidebar = $('<div class="cg-sidebar">');
    var $timeline = $('<div class="cg-timeline">');
    var gridTemplate = buildGridTemplate(this.units.length, unitWidth, this.getDependencyLead());

    $toolbar.append($title, $range);
    $sidebar.append(
      $('<div class="cg-header-cell">')
        .append($('<span class="cg-header-title">').text(translate(opts, 'sidebarHeader')))
        .append(
          $('<div class="cg-header-actions">')
            .append(renderSidebarToggleButton(this.sidebarCollapsed, opts))
        )
    );
    visibleRows.forEach(function (row) {
      var $label = $('<div class="cg-row-label">')
        .addClass('is-' + row.type)
        .toggleClass('is-collapsible', row.type !== 'small')
        .toggleClass('is-collapsed', !!this.collapsed[row.id])
        .toggleClass('is-entering', !!enteringRowIds[row.id])
        .attr('data-row-id', row.id)
        .data('row', row)
        .css('height', opts.rowHeight);

      if (row.type !== 'small') {
        $label.append($('<button class="cg-toggle" type="button">').attr('aria-label', translate(opts, 'toggleRow')));
      }

      $label.append($('<span class="cg-label-text">').text(row.label));

      var $ltBadge = buildLeadTimeBadge(row, opts);

      if ($ltBadge) {
        $label.append($ltBadge);
      }

      $sidebar.append($label);
    }, this);

    var $rows = this.renderRows(gridTemplate, visibleRows, enteringRowIds);

    $timeline.append(this.renderUnits(gridTemplate));
    $timeline.append($rows);

    if (opts.showDpndLines) {
      this.appendDependencyLines($rows, visibleRows, unitWidth);
    }

    if (opts.showToday) {
      appendTodayLine($timeline, this.units, unitWidth, this.getDependencyLead());
    }

    $board.append($sidebar, $timeline);
    $scroll.append($board);
    this.$element.append($toolbar, $scroll);
    this.bindCollapseEvents();
    this.bindDragScroll();
    this.bindTaskContextMenu();
    this.bindTaskHoverBar();
    this.bindDependencyLineSelection();
    this.restoreScrollPosition();
    this.applyInitialCenterScroll();
    this.enteringRowIds = {};
  };

  CustomGantt.prototype.renderUnits = function (gridTemplate) {
    var opts = this.options;
    var $header = $('<div class="cg-date-header">');
    var $periods = $('<div class="cg-periods">').css('grid-template-columns', gridTemplate);
    var $days = $('<div class="cg-days">').css('grid-template-columns', gridTemplate);

    buildPeriodGroups(this.units, opts).forEach(function (group) {
      $periods.append(
        $('<div class="cg-period">')
          .css('grid-column', 'span ' + group.span)
          .text(group.label)
      );
    });

    this.units.forEach(function (unit) {
      $days.append(
        $('<div class="cg-day">')
          .toggleClass('is-weekend', unit.isWeekend)
          .text(formatUnitLabel(unit, opts))
          .attr('title', formatDate(unit.start, opts.locale) + ' - ' + formatDate(unit.end, opts.locale))
      );
    });

    return $header.append($periods, $days);
  };

  CustomGantt.prototype.renderRows = function (gridTemplate, visibleRows, enteringRowIds) {
    var self = this;
    var opts = this.options;
    var unitWidth = getUnitWidth(opts);
    var lead = this.getDependencyLead();
    var $rows = $('<div class="cg-rows">');

    visibleRows.forEach(function (row) {
      var $gridRow = $('<div class="cg-grid-row">')
        .toggleClass('is-group', row.type !== 'small')
        .toggleClass('is-entering', !!enteringRowIds[row.id])
        .attr('data-row-id', row.id)
        .data('row', row)
        .css({
          gridTemplateColumns: gridTemplate,
          height: opts.rowHeight
        });

      self.units.forEach(function (unit) {
        $gridRow.append($('<div class="cg-grid-cell">').toggleClass('is-weekend', unit.isWeekend));
      });

      if (row.start && row.end) {
        if (row.isSummary) {
          $gridRow.append(renderSummaryLead(row, self.units, unitWidth, lead));
        }
        $gridRow.append(renderProgressOverrun(row, self.units, unitWidth, lead, opts));
        $gridRow.append(renderTaskBar(row, self.units, unitWidth, opts, lead));

        if (opts.showLeadTimeLine) {
          $gridRow.append(renderLeadTimeMarker(row, self.units, unitWidth, opts, lead));
        }
      }

      $rows.append($gridRow);
    });

    return $rows;
  };

  CustomGantt.prototype.bindCollapseEvents = function () {
    var self = this;

    this.$element.find('.cg-sidebar-toggle').on('click', function (event) {
      event.stopPropagation();
      self.sidebarCollapsed = !self.sidebarCollapsed;
      self.$element.toggleClass('is-sidebar-collapsed', self.sidebarCollapsed);
      $(this)
        .toggleClass('is-collapsed', self.sidebarCollapsed)
        .attr('aria-label', translate(self.options, self.sidebarCollapsed ? 'showSidebar' : 'hideSidebar'))
        .attr('title', translate(self.options, self.sidebarCollapsed ? 'showSidebar' : 'hideSidebar'));
    });

    this.$element.find('.cg-row-label.is-collapsible').on('click', function () {
      var rowId = $(this).attr('data-row-id');
      self.toggleRow(rowId);
    });

    this.$element.find('.cg-row-label.is-small').on('click', function () {
      self.openDetailModal($(this).data('row'));
    });
  };

  CustomGantt.prototype.openDetailModal = function (row) {
    var opts = this.options;
    var $overlay = $('<div class="cg-modal-overlay">');
    var $modal = $('<div class="cg-detail-modal" role="dialog" aria-modal="true">')
      .append(
        $('<div class="cg-modal-header">')
          .append($('<h3 class="cg-modal-title">').text(row.label))
          .append($('<button class="cg-modal-close" type="button">').attr('aria-label', translate(opts, 'close')).text('×'))
      )
      .append(
        $('<div class="cg-modal-body">')
          .append(renderDetailItem(translate(opts, 'scheduleName'), row.label))
          .append(renderDetailItem(translate(opts, 'startDate'), formatDate(row.start, opts.locale)))
          .append(renderDetailItem(translate(opts, 'endDate'), formatDate(row.end, opts.locale)))
          .append(renderDetailItem(translate(opts, 'status'), row.status || '-'))
          .append(renderDetailItem(translate(opts, 'progress'), clamp(row.progress, 0, 100) + '%'))
          .append(renderDetailItem(translate(opts, 'color'), row.color || '-'))
      );

    this.closeDetailModal();
    $overlay.append($modal);
    $('body').append($overlay);
    $overlay.on('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
    });
    $modal.on('click', function (event) {
      event.stopPropagation();
    });
    $modal.find('.cg-modal-close').on('click', this.closeDetailModal.bind(this));
    $(document).on('keydown' + this.modalEventNamespace, this.handleModalKeydown.bind(this));
  };

  CustomGantt.prototype.handleModalKeydown = function (event) {
    if (event.key === 'Escape') {
      this.closeDetailModal();
    }
  };

  CustomGantt.prototype.closeDetailModal = function () {
    $('.cg-modal-overlay').remove();
    $(document).off(this.modalEventNamespace);
  };

  CustomGantt.prototype.toggleRow = function (rowId) {
    var self = this;

    this.rememberScrollPosition();

    if (this.collapsed[rowId]) {
      this.markEnteringRows(getDescendantRowIds(this.rows, rowId));
      this.collapsed[rowId] = false;
      this.render();
      return;
    }

    this.animateRowsOut(getDescendantRowIds(this.rows, rowId), function () {
      self.collapsed[rowId] = true;
      self.render();
    });
  };

  CustomGantt.prototype.animateRowsOut = function (rowIds, callback) {
    var idMap = {};

    rowIds.forEach(function (rowId) {
      idMap[rowId] = true;
    });

    this.$element.find('.cg-row-label, .cg-grid-row').filter(function () {
      return !!idMap[$(this).attr('data-row-id')];
    }).addClass('is-leaving');

    window.setTimeout(callback, rowAnimationMs);
  };

  CustomGantt.prototype.markEnteringRows = function (rowIds) {
    var self = this;

    this.enteringRowIds = {};
    rowIds.forEach(function (rowId) {
      self.enteringRowIds[rowId] = true;
    });
  };

  CustomGantt.prototype.rememberScrollPosition = function () {
    var $scroll = this.$element.find('.cg-scroll');

    if (!$scroll.length) {
      return;
    }

    this.pendingScrollPosition = {
      left: $scroll.scrollLeft(),
      top: $scroll.scrollTop()
    };
  };

  CustomGantt.prototype.restoreScrollPosition = function () {
    var $scroll = this.$element.find('.cg-scroll');

    if (!this.pendingScrollPosition || !$scroll.length) {
      return;
    }

    $scroll.scrollLeft(this.pendingScrollPosition.left);
    $scroll.scrollTop(this.pendingScrollPosition.top);
    this.pendingScrollPosition = null;
  };

  CustomGantt.prototype.bindDragScroll = function () {
    var $scroll = this.$element.find('.cg-scroll');
    var namespace = this.eventNamespace;
    var isDragging = false;
    var lastPointerX = 0;

    $(document).off(namespace);
    $scroll.on('mousedown', function (event) {
      if ($(event.target).closest('button, a, input, textarea, select').length) {
        return;
      }

      if ($(event.target).closest('.cg-sidebar').length) {
        return;
      }

      if (event.button !== 0) {
        return;
      }

      isDragging = true;
      lastPointerX = event.pageX;
      $scroll.addClass('is-dragging');
    });

    $scroll.on('wheel', function (event) {
      var element = this;
      var originalEvent = event.originalEvent;
      var hasVerticalScroll = element.scrollHeight > element.clientHeight + 1;
      var hasHorizontalScroll = element.scrollWidth > element.clientWidth + 1;

      if (!hasHorizontalScroll || $(event.target).closest('.cg-sidebar').length) {
        return;
      }

      if (isDragging) {
        event.preventDefault();
        element.scrollLeft += getWheelHorizontalDelta(originalEvent);
        return;
      }

      if (hasVerticalScroll || Math.abs(originalEvent.deltaY) <= Math.abs(originalEvent.deltaX)) {
        return;
      }

      event.preventDefault();
      element.scrollLeft += originalEvent.deltaY;
    });

    $(document)
      .on('mousemove' + namespace, function (event) {
        if (!isDragging) {
          return;
        }

        event.preventDefault();
        $scroll.scrollLeft($scroll.scrollLeft() - (event.pageX - lastPointerX));
        lastPointerX = event.pageX;
      })
      .on('mouseup' + namespace, function () {
        if (!isDragging) {
          return;
        }

        isDragging = false;
        $scroll.removeClass('is-dragging');
      });
  };

  CustomGantt.prototype.bindTaskContextMenu = function () {
    var self = this;

    this.$element.find('.cg-task-bar').on('contextmenu', function (event) {
      event.preventDefault();
      event.stopPropagation();
      self.openTaskContextMenu($(this).data('taskRow'), event.clientX, event.clientY);
    });

    $(document)
      .on('mousedown' + this.eventNamespace, function (event) {
        if (!$(event.target).closest('.cg-context-menu').length) {
          self.closeTaskContextMenu();
        }
      })
      .on('keydown' + this.eventNamespace, function (event) {
        if (event.key === 'Escape') {
          self.closeTaskContextMenu();
        }
      });

    this.$element.find('.cg-scroll').on('scroll', function () {
      self.closeTaskContextMenu();
    });
  };

  CustomGantt.prototype.openTaskContextMenu = function (row, clientX, clientY) {
    var opts = this.options;
    var typeText = translate(opts, row.isSummary ? 'summaryTask' : 'normalTask');
    var $menu = $('<div class="cg-context-menu" role="menu">')
      .append($('<div class="cg-context-title">').text(row.label))
      .append(renderContextRow(translate(opts, 'type'), typeText))
      .append(renderContextRow(translate(opts, 'period'), formatDate(row.start, opts.locale) + ' - ' + formatDate(row.end, opts.locale)))
      .append(renderContextRow(translate(opts, 'status'), row.status || '-'))
      .append(renderContextRow(translate(opts, 'progress'), clamp(row.progress, 0, 100) + '%'));

    this.closeTaskContextMenu();
    $('body').append($menu);
    positionFloatingElement($menu, clientX, clientY);
  };

  CustomGantt.prototype.closeTaskContextMenu = function () {
    $('.cg-context-menu').remove();
  };

  CustomGantt.prototype.bindTaskHoverBar = function () {
    var self = this;

    this.$element.find('.cg-task-bar')
      .on('mouseenter', function (event) {
        self.showTaskTooltip($(this).data('taskRow'), event.clientX, event.clientY);
      })
      .on('mousemove', function (event) {
        self.positionTaskTooltip(event.clientX, event.clientY);
      })
      .on('mouseleave', function () {
        self.hideTaskTooltip();
      });

    this.$element.find('.cg-scroll').on('scroll', function () {
      self.hideTaskTooltip();
    });
  };

  CustomGantt.prototype.showTaskTooltip = function (row, clientX, clientY) {
    var $tooltip = $('.cg-task-tooltip');

    if (!$tooltip.length) {
      $tooltip = $('<div class="cg-task-tooltip" role="tooltip">').appendTo('body');
    }

    $tooltip.text(row.label).addClass('is-visible');
    this.positionTaskTooltip(clientX, clientY);
  };

  CustomGantt.prototype.positionTaskTooltip = function (clientX, clientY) {
    var $tooltip = $('.cg-task-tooltip');

    if (!$tooltip.length) {
      return;
    }

    positionFloatingElement($tooltip, clientX + 12, clientY + 14);
  };

  CustomGantt.prototype.hideTaskTooltip = function () {
    $('.cg-task-tooltip').remove();
  };

  CustomGantt.prototype.appendDependencyLines = function ($rows, visibleRows, unitWidth) {
    var opts = this.options;
    var rowIndexMap = {};

    visibleRows.forEach(function (row, index) {
      rowIndexMap[row.id] = index;
    });

    var edges = buildDependencyEdges(visibleRows);
    var $svg = renderDependencyLines(edges, rowIndexMap, visibleRows.length, this.units, unitWidth, opts.rowHeight, this.dependencyArrowId, this.getDependencyLead());

    $rows.append($svg);
  };

  CustomGantt.prototype.bindDependencyLineSelection = function () {
    var self = this;

    if (!this.options.showDpndLines) {
      return;
    }

    this.$element.find('.cg-task-bar').on('click', function (event) {
      event.stopPropagation();
      var row = $(this).data('taskRow');

      self.activeDependencyRowId = self.activeDependencyRowId === row.id ? null : row.id;
      self.applyDependencySelection();
    });

    this.applyDependencySelection();
  };

  CustomGantt.prototype.applyDependencySelection = function () {
    var activeRowId = this.activeDependencyRowId;
    var $lines = this.$element.find('.cg-dependency-line');
    var $bars = this.$element.find('.cg-task-bar');

    $bars.removeClass('is-dependency-active');

    if (!activeRowId) {
      $lines.each(function () {
        $(this).removeClass('is-dimmed is-highlighted').attr('marker-end', $(this).attr('data-arrow'));
      });
      return;
    }

    $lines.each(function () {
      var $line = $(this);
      var isConnected = $line.attr('data-from-row') === activeRowId || $line.attr('data-to-row') === activeRowId;

      $line
        .toggleClass('is-highlighted', isConnected)
        .toggleClass('is-dimmed', !isConnected)
        .attr('marker-end', $line.attr(isConnected ? 'data-arrow-active' : 'data-arrow'));
    });

    $bars.filter(function () {
      return $(this).data('taskRow').id === activeRowId;
    }).addClass('is-dependency-active');
  };

  CustomGantt.prototype.applyInitialCenterScroll = function () {
    var self = this;
    var initialPosition = getInitialCenterPosition(this.options.initialCenterDate, this.units);

    if (this.initialScrollApplied || !initialPosition || !this.units.length) {
      return;
    }

    this.initialScrollApplied = true;
    if (window.requestAnimationFrame) {
      window.requestAnimationFrame(function () {
        self.scrollToDate(initialPosition.date, initialPosition.align);
      });
    } else {
      window.setTimeout(function () {
        self.scrollToDate(initialPosition.date, initialPosition.align);
      }, 0);
    }
  };

  CustomGantt.prototype.scrollToDate = function (date, align) {
    var $scroll = this.$element.find('.cg-scroll');
    var unitWidth = getUnitWidth(this.options);
    var sidebarWidth = this.$element.find('.cg-sidebar').outerWidth() || 0;
    var viewportWidth = Math.max($scroll.innerWidth() - sidebarWidth, 0);
    var lead = this.getDependencyLead();
    var targetOffset = dateToOffset(date, this.units, unitWidth);
    var scrollLeft;

    if (align === 'start') {
      // 넓어진 첫 셀을 그대로 보여 줘야 역방향 선이 잘리지 않는다.
      scrollLeft = targetOffset;
    } else if (align === 'end') {
      scrollLeft = lead + targetOffset - viewportWidth + unitWidth;
    } else {
      scrollLeft = lead + targetOffset - (viewportWidth / 2);
    }

    $scroll.scrollLeft(Math.max(scrollLeft, 0));
  };

  function renderToggleAllButton(rows, collapsed, options) {
    var isCollapsed = areAllGroupsCollapsed(rows, collapsed);
    var label = translate(options, isCollapsed ? 'expandAll' : 'collapseAll');

    return $('<button class="cg-toggle-all" type="button">')
      .toggleClass('is-collapsed', isCollapsed)
      .attr('aria-label', label)
      .attr('title', label);
  }

  function renderSidebarToggleButton(isCollapsed, options) {
    var label = translate(options, isCollapsed ? 'showSidebar' : 'hideSidebar');

    return $('<button class="cg-sidebar-toggle" type="button">')
      .toggleClass('is-collapsed', isCollapsed)
      .attr('aria-label', label)
      .attr('title', label);
  }

  function areAllGroupsCollapsed(rows, collapsed) {
    var groupRows = rows.filter(function (row) {
      return row.type !== 'small';
    });

    return groupRows.length > 0 && groupRows.every(function (row) {
      return !!collapsed[row.id];
    });
  }

  function flattenRows(data, options) {
    var rows = [];
    var palette = getColorPalette(options.colorTheme);
    var colorIndex = 0;

    (data || []).forEach(function (largeGroup, largeIndex) {
      var largeId = 'large-' + largeIndex;

      rows.push(createRowFromData(largeGroup, {
        type: 'large',
        id: largeId,
        label: largeGroup.large || largeGroup.name || translate(options, 'largeGroup')
      }, options, palette, colorIndex));

      (largeGroup.children || []).forEach(function (mediumGroup, mediumIndex) {
        var mediumId = largeId + '-medium-' + mediumIndex;

        rows.push(createRowFromData(mediumGroup, {
          type: 'medium',
          id: mediumId,
          parentId: largeId,
          label: mediumGroup.medium || mediumGroup.name || translate(options, 'mediumGroup')
        }, options, palette, colorIndex));

        (mediumGroup.children || []).forEach(function (task) {
          rows.push(createRowFromData(task, {
            type: 'small',
            id: mediumId + '-small-' + rows.length,
            parentId: mediumId,
            label: task.small || task.name || translate(options, 'smallTask'),
            progress: 0
          }, options, palette, colorIndex));
          colorIndex += 1;
        });
      });
    });

    return applyGroupSummaries(rows);
  }

  function applyGroupSummaries(rows) {
    var levels = {
      large: 1,
      medium: 2,
      small: 3
    };

    rows.forEach(function (row, rowIndex) {
      if (row.type === 'small') {
        return;
      }

      var tasks = [];

      for (var index = rowIndex + 1; index < rows.length; index += 1) {
        var nextRow = rows[index];

        if (levels[nextRow.type] <= levels[row.type]) {
          break;
        }

        if (nextRow.type === 'small' && nextRow.start && nextRow.end) {
          tasks.push(nextRow);
        }
      }

      if (!tasks.length) {
        return;
      }

      row.start = row.start || minDate(tasks.map(function (task) {
        return task.start;
      }));
      row.end = row.end || maxDate(tasks.map(function (task) {
        return task.end;
      }));
      row.progress = row.hasOwnProgress ? row.progress : Math.round(tasks.reduce(function (sum, task) {
        return sum + task.progress;
      }, 0) / tasks.length);
      row.color = row.color || tasks[0].color;
      row.isSummary = true;
    });

    return rows;
  }

  function createRowFromData(data, row, options, palette, colorIndex) {
    data = data || {};

    var schedule = resolveSchedule(data, options);
    var hasOwnProgress = data.progress !== undefined && data.progress !== null;

    row.source = data;
    row.sourceType = data.type;
    row.start = schedule.start || row.start || null;
    row.end = schedule.end || row.end || null;
    row.isPlanned = schedule.isPlanned;
    row.status = data.status;
    row.hasOwnProgress = hasOwnProgress;
    // 진행바 폭은 100%를 넘길 수 없어 clamp 하되, 초과 표시를 위해 원본을 남긴다.
    row.rawProgress = hasOwnProgress ? Number(data.progress) : null;
    row.progress = hasOwnProgress ? clamp(data.progress, 0, 100) : row.progress;
    row.color = resolveRowColor(data, row, options, palette, colorIndex);
    row.dependencies = Array.isArray(data.dependencies) ? data.dependencies : [];
    row.afterDependencies = Array.isArray(data.afterDependencies) ? data.afterDependencies : [];

    return row;
  }

  // start/end 가 비면 plan 값으로 대체하고, start 만 있으면 expectDays 로 종료일을 만든다.
  function resolveSchedule(data, options) {
    var start = parseDate(data.start);
    var end = parseDate(data.end);

    if (start) {
      return {
        start: start,
        end: end || addExpectDays(start, data, options) || parseDate(data.planEnd),
        isPlanned: false
      };
    }

    return {
      start: parseDate(data.planStart),
      end: end || parseDate(data.planEnd),
      isPlanned: true
    };
  }

  // expectDays 는 시작일을 포함한 일수라 하루를 빼고 더한다.
  function addExpectDays(start, data, options) {
    var field = (options && options.leadTimeField) || 'expectDays';
    var days = Number(data[field]);

    if (!start || Number.isNaN(days) || days < 1) {
      return null;
    }

    return addDays(start, days - 1);
  }

  function getDependencyKey(row) {
    if (row.source && row.source.id !== undefined && row.source.id !== null) {
      return row.source.id;
    }

    return row.id;
  }

  function buildDependencyEdges(visibleRows) {
    var lookup = {};

    visibleRows.forEach(function (row) {
      lookup[getDependencyKey(row)] = row;
    });

    var edges = [];

    function pushEdge(fromRow, toRow, type) {
      if (!fromRow || fromRow === toRow) {
        return;
      }

      if (!fromRow.start || !fromRow.end || !toRow.start || !toRow.end) {
        return;
      }

      edges.push({ from: fromRow, to: toRow, type: type });
    }

    visibleRows.forEach(function (row) {
      // 선행: 상대의 오른쪽 -> 내 왼쪽
      (row.dependencies || []).forEach(function (dependencyId) {
        pushEdge(lookup[dependencyId], row, 'dependency');
      });

      // 후행: 내 오른쪽 -> 상대의 오른쪽
      (row.afterDependencies || []).forEach(function (afterId) {
        pushEdge(row, lookup[afterId], 'after');
      });
    });

    return edges;
  }

  // 역방향(선행이 끝나기 전 후행 시작) 중에서도, 우회 경로가 차트 왼쪽 밖으로
  // 나가는 건은 맨 앞 날짜에 붙은 것뿐이다. 그 건만 모은다.
  function collectBackwardDependencies(rows, units, unitWidth) {
    var lookup = {};
    var backward = [];

    rows.forEach(function (row) {
      lookup[getDependencyKey(row)] = row;
    });

    rows.forEach(function (row) {
      (row.dependencies || []).forEach(function (dependencyId) {
        var fromRow = lookup[dependencyId];

        if (!fromRow || fromRow === row || !fromRow.end || !row.start) {
          return;
        }

        if (row.start >= fromRow.end) {
          return;
        }

        var overflow = getDependencyLeftOverflow(row, units, unitWidth);

        if (overflow <= 0) {
          return;
        }

        backward.push({
          fromId: dependencyId,
          toId: getDependencyKey(row),
          fromLabel: fromRow.label,
          toLabel: row.label,
          overlapDays: diffDays(row.start, fromRow.end),
          leftOverflow: overflow
        });
      });
    });

    return backward;
  }

  // 우회 경로 x = (대상 bar 왼쪽) - detourLead. 이 값이 음수인 만큼이 차트 밖이다.
  function getDependencyLeftOverflow(toRow, units, unitWidth) {
    if (!units || !units.length || !toRow.start) {
      return 0;
    }

    var toX = taskBarInset + dateToOffset(toRow.start, units, unitWidth);

    return Math.max(dependencyDetourLead - toX, 0);
  }

  function resolveRowColor(data, row, options, palette, colorIndex) {
    var renderedColor = callColorRenderer(data, row, options);

    if (renderedColor) {
      return normalizeColor(renderedColor);
    }

    if (!options.ignoreDataColors && data.color) {
      return normalizeColor(data.color);
    }

    return row.type === 'small' ? normalizeColor(palette[colorIndex % palette.length]) : null;
  }

  function callColorRenderer(data, row, options) {
    if (typeof options.colorRenderer !== 'function') {
      return null;
    }

    return options.colorRenderer(data, {
      row: row,
      type: row.type,
      status: data.status,
      progress: row.progress,
      source: data
    });
  }

  function getLeadTimeValue(row, options) {
    var field = options.leadTimeField || 'expectDays';
    var raw = row.source && row.source[field];
    var value = Number(raw);

    return raw !== undefined && raw !== null && !Number.isNaN(value) ? value : null;
  }

  function buildLeadTimeBadge(row, options) {
    var leadTime = getLeadTimeValue(row, options);

    if (leadTime === null || !row.start || !row.end) {
      return null;
    }

    var actualDays = diffDays(row.start, row.end) + 1;
    var diff = actualDays - leadTime;
    var isOver = diff > 0;

    // 글자는 L/T 일수 차이, 색은 진행률 단계라 툴팁에 둘 다 적는다.
    var leadTimeText = translate(options, isOver ? 'leadTimeOver' : 'leadTimeUnder', {
      days: leadTime,
      diff: Math.abs(diff)
    });

    return $('<span class="cg-lt-badge">')
      // 색 단계는 초과 막대와 동일하게 warning/delay 기준을 따른다.
      .addClass('is-' + getProgressLevel(row))
      .attr('title', translate(options, 'leadTimeBadge', {
        base: leadTimeText,
        progress: getDisplayProgress(row),
        level: getProgressLevelText(row, options)
      }))
      .text('L/T ' + (diff > 0 ? '+' : '') + diff);
  }

  function getVisibleRows(rows, collapsed) {
    var hiddenParents = {};

    return rows.filter(function (row) {
      if (row.parentId && hiddenParents[row.parentId]) {
        hiddenParents[row.id] = true;
        return false;
      }

      if (row.parentId && collapsed[row.parentId]) {
        hiddenParents[row.id] = true;
        return false;
      }

      return true;
    });
  }

  function getDescendantRowIds(rows, rowId) {
    var rowIndex = -1;
    var levels = {
      large: 1,
      medium: 2,
      small: 3
    };
    var descendantIds = [];

    rows.forEach(function (row, index) {
      if (row.id === rowId) {
        rowIndex = index;
      }
    });

    if (rowIndex < 0) {
      return descendantIds;
    }

    for (var index = rowIndex + 1; index < rows.length; index += 1) {
      if (levels[rows[index].type] <= levels[rows[rowIndex].type]) {
        break;
      }

      descendantIds.push(rows[index].id);
    }

    return descendantIds;
  }

  function buildHierarchy(largeList, mediumList, smallList, options) {
    var fields = $.extend({
      largeId: 'id',
      largeName: 'name',
      mediumId: 'id',
      mediumLargeId: 'largeId',
      mediumName: 'name',
      smallId: 'id',
      smallMediumId: 'mediumId',
      smallName: 'name',
      start: 'start',
      end: 'end',
      status: 'status',
      progress: 'progress',
      color: 'color',
      // 이름이 비었을 때 쓰는 기본 라벨의 언어. 플러그인 기본값과 맞춘다.
      currentLanguage: defaults.currentLanguage
    }, options);
    var largeMap = {};
    var mediumMap = {};
    var hierarchy = [];

    (largeList || []).forEach(function (largeItem) {
      var largeId = getValue(largeItem, fields.largeId);
      var largeGroup = {
        large: getValue(largeItem, fields.largeName) || largeItem.large || translate(fields, 'largeGroup'),
        id: largeId,
        type: largeItem.type || 'large',
        start: getValue(largeItem, fields.start),
        end: getValue(largeItem, fields.end),
        status: getValue(largeItem, fields.status),
        progress: getValue(largeItem, fields.progress),
        children: []
      };

      copyExtraFields(largeItem, largeGroup, [fields.largeId, fields.largeName, fields.start, fields.end, fields.status, fields.progress, 'large', 'children']);
      largeMap[largeId] = largeGroup;
      hierarchy.push(largeGroup);
    });

    (mediumList || []).forEach(function (mediumItem) {
      var mediumId = getValue(mediumItem, fields.mediumId);
      var parentLargeId = getValue(mediumItem, fields.mediumLargeId);
      var largeGroup = largeMap[parentLargeId];
      var mediumGroup = {
        medium: getValue(mediumItem, fields.mediumName) || mediumItem.medium || translate(fields, 'mediumGroup'),
        id: mediumId,
        type: mediumItem.type || 'medium',
        start: getValue(mediumItem, fields.start),
        end: getValue(mediumItem, fields.end),
        status: getValue(mediumItem, fields.status),
        progress: getValue(mediumItem, fields.progress),
        children: []
      };

      copyExtraFields(mediumItem, mediumGroup, [
        fields.mediumId,
        fields.mediumLargeId,
        fields.mediumName,
        fields.start,
        fields.end,
        fields.status,
        fields.progress,
        'medium',
        'children'
      ]);
      mediumMap[mediumId] = mediumGroup;

      if (largeGroup) {
        largeGroup.children.push(mediumGroup);
      }
    });

    (smallList || []).forEach(function (smallItem) {
      var parentMediumId = getValue(smallItem, fields.smallMediumId);
      var mediumGroup = mediumMap[parentMediumId];
      var task = {
        small: getValue(smallItem, fields.smallName) || smallItem.small || translate(fields, 'smallTask'),
        id: getValue(smallItem, fields.smallId),
        type: smallItem.type || 'small',
        start: getValue(smallItem, fields.start),
        end: getValue(smallItem, fields.end),
        status: getValue(smallItem, fields.status),
        progress: getValue(smallItem, fields.progress) || 0
      };
      var color = getValue(smallItem, fields.color);

      if (color) {
        task.color = color;
      }

      copyExtraFields(smallItem, task, [
        fields.smallMediumId,
        fields.smallId,
        fields.smallName,
        fields.start,
        fields.end,
        fields.status,
        fields.progress,
        fields.color,
        'small'
      ]);

      if (mediumGroup) {
        mediumGroup.children.push(task);
      }
    });

    return hierarchy;
  }

  function buildUnits(options, rows) {
    var starts = [];
    var ends = [];

    rows.forEach(function (row) {
      if (row.start) {
        starts.push(row.start);
      }
      if (row.end) {
        // 초과 구간도 달력 위에 그려야 하므로 기간에 포함한다.
        var overrunDays = getOverrunDays(row);

        ends.push(overrunDays ? addDays(row.end, overrunDays) : row.end);
      }
    });

    var start = parseDate(options.startDate) || minDate(starts);
    var end = parseDate(options.endDate) || maxDate(ends);
    var units = [];
    var viewMode = normalizeViewMode(options.viewMode);

    if (!start || !end || start > end) {
      return units;
    }

    start = stripTime(start);
    end = stripTime(end);

    if (viewMode === 'week') {
      start = startOfWeek(start);
    } else if (viewMode === 'month') {
      start = new Date(start.getFullYear(), start.getMonth(), 1);
    }

    while (start <= end) {
      var unitStart = new Date(start);
      var unitEnd = getUnitEnd(unitStart, viewMode, end);

      if (!(viewMode === 'day' && options.excludeWeekends && isWeekend(unitStart))) {
        units.push({
          start: unitStart,
          end: unitEnd,
          viewMode: viewMode,
          isWeekend: viewMode === 'day' && isWeekend(unitStart)
        });
      }

      start = addDays(unitEnd, 1);
    }

    return units;
  }

  function renderTaskBar(row, units, unitWidth, options, lead) {
    var metrics = getTaskBarMetrics(row, units, unitWidth, lead);

    if (!metrics) {
      return $();
    }

    var progress = clamp(row.progress, 0, 100);
    var color = row.color || (row.isSummary ? '#334155' : getColorPalette(options.colorTheme)[0]);
    var label = getBarLabel(row, progress, options);
    var textColor = getReadableTextColor(color);
    var isOverProgress = row.rawProgress > 100;
    var $bar = $('<div class="cg-task-bar">')
      .toggleClass('is-summary', !!row.isSummary)
      .toggleClass('is-over-progress', isOverProgress)
      .data('taskRow', row)
      .css({ left: metrics.left, width: metrics.width });
    var $progress = $('<div class="cg-task-progress">').css('width', progress + '%');
    var $name = $('<div class="cg-task-name">')
      .css('color', textColor)
      .append($('<span class="cg-task-name-text">').text(label));

    if (color) {
      $bar.css({
        background: hexToRgba(color, 0.16),
        boxShadow: 'inset 0 0 0 1px ' + hexToRgba(color, 0.22)
      });
      $progress.css('background', color);
    }

    return $bar.append($progress, $name);
  }

  // 초과 구간은 계획 종료일 "다음 날부터" 실제 경과분까지. 바 바깥으로 이어 붙인다.
  function renderProgressOverrun(row, units, unitWidth, lead, options) {
    var overrunDays = getOverrunDays(row);

    if (!overrunDays) {
      return $();
    }

    var planned = getTaskBarMetrics(row, units, unitWidth, lead);
    var extended = getTaskBarMetrics({
      start: row.start,
      end: addDays(row.end, overrunDays)
    }, units, unitWidth, lead);

    if (!planned || !extended) {
      return $();
    }

    var plannedRight = planned.left + planned.width;
    var width = (extended.left + extended.width) - plannedRight;

    if (width <= 0) {
      return $();
    }

    // 바 뒤로 조금 물려 시작해 이음매를 없앤다. 오른쪽 끝은 그대로 둔다.
    var overlap = 4;

    return $('<div class="cg-task-over">')
      .addClass('is-' + getProgressLevel(row))
      .attr('title', translate(options, 'overrun', {
        days: overrunDays,
        progress: row.rawProgress,
        level: getProgressLevelText(row, options)
      }))
      .css({ left: plannedRight - overlap, width: width + overlap });
  }

  // 초과 일수 = 계획 기간 x (진행률 - 100) / 100
  function getOverrunDays(row) {
    if (!(row.rawProgress > 100) || !row.start || !row.end) {
      return 0;
    }

    var plannedDays = diffDays(row.start, row.end) + 1;

    return Math.max(Math.round(plannedDays * (row.rawProgress - 100) / 100), 0);
  }

  // 초과분 색 단계. warning 미만 초록 / warning~delay 주황 / delay 이상 빨강.
  function getOverProgressLevel(row) {
    var source = row.source || {};
    var value = row.rawProgress;
    var warning = toThreshold(source.warning);
    var delay = toThreshold(source.delay);

    if (delay !== null && value >= delay) {
      return 'delay';
    }

    if (warning !== null) {
      return value >= warning ? 'warning' : 'safe';
    }

    return 'warning';
  }

  // 초과 막대와 L/T 배지가 같은 색 단계를 쓰도록 판정을 한 군데로 모은다.
  // 100 이하면 초과 자체가 없으므로 안전으로 본다.
  function getProgressLevel(row) {
    return row.rawProgress > 100 ? getOverProgressLevel(row) : 'safe';
  }

  function getProgressLevelText(row, options) {
    var keys = {
      safe: 'levelSafe',
      warning: 'levelWarning',
      delay: 'levelDelay'
    };

    return translate(options, keys[getProgressLevel(row)]);
  }

  // rawProgress 는 데이터에 progress 가 없으면 null 이라 요약 행에서는 계산값을 쓴다.
  function getDisplayProgress(row) {
    return row.rawProgress === null || row.rawProgress === undefined
      ? clamp(row.progress, 0, 100)
      : row.rawProgress;
  }

  function toThreshold(raw) {
    var value = Number(raw);

    return raw !== undefined && raw !== null && raw !== '' && !Number.isNaN(value) ? value : null;
  }

  function getBarLabel(row, progress, options) {
    var label;

    if (typeof options.barLabelRenderer === 'function') {
      label = options.barLabelRenderer(row.source || row, {
        row: row,
        type: row.type,
        status: row.status,
        progress: progress,
        // 100 으로 잘리기 전 원본과 초과 판정도 함께 넘긴다.
        rawProgress: row.rawProgress,
        isOverProgress: row.rawProgress > 100,
        overLevel: row.rawProgress > 100 ? getOverProgressLevel(row) : null,
        overrunDays: getOverrunDays(row),
        source: row.source || row
      });
    }

    if (label === null || label === undefined) {
      return row.label + ' ' + progress + '%';
    }

    return String(label);
  }

  function renderLeadTimeMarker(row, units, unitWidth, options, lead) {
    var leadTime = getLeadTimeValue(row, options);

    if (leadTime === null) {
      return $();
    }

    var boundaryDate = addDays(row.start, leadTime - 1);
    var boundaryMetrics = getTaskBarMetrics({ start: row.start, end: boundaryDate }, units, unitWidth, lead);

    if (!boundaryMetrics) {
      return $();
    }

    // 마커는 기준선일 뿐이라 상태와 무관하게 항상 같은 색으로 둔다.
    return $('<div class="cg-lt-marker">')
      .css('left', boundaryMetrics.left + boundaryMetrics.width)
      .attr('title', translate(options, 'leadTimeMarker', { days: leadTime, date: formatDate(boundaryDate, options.locale) }));
  }

  // 첫 컬럼만 lead 만큼 넓히고 나머지는 unitWidth 그대로 둔다.
  function buildGridTemplate(unitCount, unitWidth, lead) {
    if (!lead || unitCount < 1) {
      return 'repeat(' + unitCount + ', ' + unitWidth + 'px)';
    }

    var firstColumn = (unitWidth + lead) + 'px';

    if (unitCount === 1) {
      return firstColumn;
    }

    return firstColumn + ' repeat(' + (unitCount - 1) + ', ' + unitWidth + 'px)';
  }

  function renderSummaryLead(row, units, unitWidth, lead) {
    var metrics = getTaskBarMetrics(row, units, unitWidth, lead);
    var origin = (lead || 0) + 3;

    if (!metrics || metrics.left - origin <= 9) {
      return $();
    }

    return $('<div class="cg-summary-lead">').css({
      left: origin,
      width: metrics.left - origin - 3
    });
  }

  function createSvgElement(tag) {
    return document.createElementNS('http://www.w3.org/2000/svg', tag);
  }

  function createDependencyArrowMarker(id, color) {
    var marker = createSvgElement('marker');
    var arrow = createSvgElement('path');

    marker.setAttribute('id', id);
    marker.setAttribute('viewBox', '0 0 8 8');
    marker.setAttribute('refX', '7');
    marker.setAttribute('refY', '4');
    marker.setAttribute('markerWidth', '5');
    marker.setAttribute('markerHeight', '5');
    marker.setAttribute('orient', 'auto-start-reverse');

    arrow.setAttribute('d', 'M0,0 L8,4 L0,8 Z');
    arrow.setAttribute('fill', color);

    marker.appendChild(arrow);
    return marker;
  }

  function buildDependencyLinePath(fromX, fromY, toX, toY, rowHeight) {
    var lead = dependencyDetourLead;
    var midX = fromX + lead;

    if (toX - lead >= midX) {
      return ['M', fromX, fromY, 'L', midX, fromY, 'L', midX, toY, 'L', toX, toY].join(' ');
    }

    var detourX = toX - lead;
    var detourY = fromY <= toY ? fromY + (rowHeight / 2) : fromY - (rowHeight / 2);

    return [
      'M', fromX, fromY,
      'L', midX, fromY,
      'L', midX, detourY,
      'L', detourX, detourY,
      'L', detourX, toY,
      'L', toX, toY
    ].join(' ');
  }

  // 후행선: 내 오른쪽 -> 대상 오른쪽.
  // 선행선은 대상의 왼쪽으로 들어가므로, 후행선은 두 bar 오른쪽 바깥의 세로선을 타고
  // 대상 오른쪽으로 되짚어 들어간다. 그래야 선행선이 지나는 영역과 겹치지 않는다.
  function buildAfterDependencyPath(fromX, fromY, toX, toY, maxX) {
    // 차트 오른쪽 밖으로 나가면 스크롤 영역에서 잘리므로 경계 안으로 제한한다.
    // bar 는 항상 taskBarInset 만큼 안쪽에서 끝나므로 turnX > toX 는 유지된다.
    var turnX = Math.min(Math.max(fromX, toX) + afterDependencyGap, maxX - 2);

    return ['M', fromX, fromY, 'L', turnX, fromY, 'L', turnX, toY, 'L', toX, toY].join(' ');
  }

  function renderDependencyLines(edges, rowIndexMap, rowCount, units, unitWidth, rowHeight, arrowId, lead) {
    if (!edges.length) {
      return $();
    }

    var svg = createSvgElement('svg');
    var defs = createSvgElement('defs');
    var maxX = (lead || 0) + (units.length * unitWidth);

    svg.setAttribute('class', 'cg-dependency-svg');
    svg.setAttribute('width', maxX);
    svg.setAttribute('height', rowCount * rowHeight);

    defs.appendChild(createDependencyArrowMarker(arrowId, '#94a3b8'));
    defs.appendChild(createDependencyArrowMarker(arrowId + '-active', '#2563eb'));
    defs.appendChild(createDependencyArrowMarker(arrowId + '-after', '#7c3aed'));
    defs.appendChild(createDependencyArrowMarker(arrowId + '-after-active', '#5b21b6'));
    svg.appendChild(defs);

    edges.forEach(function (edge) {
      var fromMetrics = getTaskBarMetrics(edge.from, units, unitWidth, lead);
      var toMetrics = getTaskBarMetrics(edge.to, units, unitWidth, lead);

      if (!fromMetrics || !toMetrics) {
        return;
      }

      var isAfter = edge.type === 'after';
      var fromY = (rowIndexMap[edge.from.id] * rowHeight) + (rowHeight / 2);
      var toY = (rowIndexMap[edge.to.id] * rowHeight) + (rowHeight / 2);
      var fromX = fromMetrics.left + fromMetrics.width;
      // 후행선은 양쪽 다 오른쪽 끝을 잇는다.
      var toX = isAfter ? toMetrics.left + toMetrics.width : toMetrics.left;
      var suffix = isAfter ? '-after' : '';
      var path = createSvgElement('path');

      path.setAttribute('class', 'cg-dependency-line' + (isAfter ? ' is-after' : ''));
      path.setAttribute('data-from-row', edge.from.id);
      path.setAttribute('data-to-row', edge.to.id);
      path.setAttribute('data-arrow', 'url(#' + arrowId + suffix + ')');
      path.setAttribute('data-arrow-active', 'url(#' + arrowId + suffix + '-active)');
      path.setAttribute('marker-end', 'url(#' + arrowId + suffix + ')');
      path.setAttribute('d', isAfter
        ? buildAfterDependencyPath(fromX, fromY, toX, toY, maxX)
        : buildDependencyLinePath(fromX, fromY, toX, toY, rowHeight));
      svg.appendChild(path);
    });

    return $(svg);
  }

  function getTaskBarMetrics(row, units, unitWidth, lead) {
    var start = stripTime(row.start);
    var end = stripTime(row.end);

    if (!start || !end) {
      return null;
    }

    var startOffset = (lead || 0) + dateToOffset(start, units, unitWidth);
    var endOffset = (lead || 0) + dateToOffset(addDays(end, 1), units, unitWidth);

    return {
      left: startOffset + taskBarInset,
      width: Math.max(endOffset - startOffset - (taskBarInset * 2), 8)
    };
  }

  function appendTodayLine($timeline, units, unitWidth, lead) {
    var today = stripTime(new Date());
    var start = stripTime(units[0].start);
    var end = stripTime(units[units.length - 1].end);

    if (today < start || today > end) {
      return;
    }

    $timeline.append(
      $('<div class="cg-today-line">').css('left', (lead || 0) + dateToOffset(today, units, unitWidth))
    );
  }

  function parseDate(value) {
    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      return stripTime(value);
    }

    if (value === 'today') {
      return stripTime(new Date());
    }

    var parsed = new Date(value + 'T00:00:00');
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function getInitialCenterPosition(value, units) {
    if (!value || !units.length) {
      return null;
    }

    if (value === 'start') {
      return {
        date: units[0].start,
        align: 'start'
      };
    }

    if (value === 'end') {
      return {
        date: units[units.length - 1].end,
        align: 'end'
      };
    }

    var date = parseDate(value);
    return date ? {
      date: date,
      align: 'center'
    } : null;
  }

  function stripTime(date) {
    if (!date) {
      return null;
    }
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function diffDays(start, end) {
    var msPerDay = 24 * 60 * 60 * 1000;
    return Math.round((stripTime(end) - stripTime(start)) / msPerDay);
  }

  function addDays(date, days) {
    var next = stripTime(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  function minDate(dates) {
    return dates.length ? new Date(Math.min.apply(null, dates)) : null;
  }

  function maxDate(dates) {
    return dates.length ? new Date(Math.max.apply(null, dates)) : null;
  }

  function isWeekend(date) {
    return date.getDay() === 0 || date.getDay() === 6;
  }

  function formatDate(date, locale) {
    return date.toLocaleDateString(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  }

  function formatUnitLabel(unit, options) {
    if (unit.viewMode === 'month') {
      return translate(options, 'monthLabel', {
        month: unit.start.getMonth() + 1,
        monthName: monthShortNames[unit.start.getMonth()]
      });
    }

    if (unit.viewMode === 'week') {
      return translate(options, 'weekLabel', {
        month: unit.start.getMonth() + 1,
        day: unit.start.getDate()
      });
    }

    return String(unit.start.getDate());
  }

  function buildPeriodGroups(units, options) {
    var groups = [];

    units.forEach(function (unit) {
      var label = formatPeriodLabel(unit, options);
      var lastGroup = groups[groups.length - 1];

      if (lastGroup && lastGroup.label === label) {
        lastGroup.span += 1;
      } else {
        groups.push({
          label: label,
          span: 1
        });
      }
    });

    return groups;
  }

  function formatPeriodLabel(unit, options) {
    if (unit.viewMode === 'month') {
      return String(unit.start.getFullYear());
    }

    return unit.start.getFullYear() + '.' + padNumber(unit.start.getMonth() + 1);
  }

  function padNumber(value) {
    return String(value).padStart(2, '0');
  }

  function padHex(value) {
    return String(value).padStart(2, '0');
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(Number(value) || 0, min), max);
  }

  function renderContextRow(label, value) {
    return $('<div class="cg-context-row">')
      .append($('<span class="cg-context-label">').text(label))
      .append($('<span class="cg-context-value">').text(value));
  }

  function renderDetailItem(label, value) {
    return $('<div class="cg-detail-item">')
      .append($('<span class="cg-detail-label">').text(label))
      .append($('<span class="cg-detail-value">').text(value));
  }

  function positionFloatingElement($menu, clientX, clientY) {
    var margin = 10;
    var menuWidth = $menu.outerWidth();
    var menuHeight = $menu.outerHeight();
    var left = Math.min(clientX, window.innerWidth - menuWidth - margin);
    var top = Math.min(clientY, window.innerHeight - menuHeight - margin);

    $menu.css({
      left: Math.max(left, margin),
      top: Math.max(top, margin)
    });
  }

  function getWheelHorizontalDelta(event) {
    return Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
  }

  function getColorPalette(themeName) {
    return colorThemes[themeName] || colorThemes.default;
  }

  function getInitialExpandLevel(options) {
    if (options.initialExpandLevel) {
      return options.initialExpandLevel;
    }

    return options.initialCollapsed ? 'large' : 'small';
  }

  function normalizeColor(color) {
    if (!color || typeof color !== 'string') {
      return null;
    }

    var value = color.trim();
    var namedColorMap = {
      black: '#000000',
      blue: '#0000ff',
      cyan: '#00ffff',
      gray: '#808080',
      green: '#008000',
      grey: '#808080',
      orange: '#ffa500',
      pink: '#ffc0cb',
      purple: '#800080',
      red: '#ff0000',
      slate: '#64748b',
      teal: '#008080',
      white: '#ffffff',
      yellow: '#ffff00'
    };
    var lowerValue = value.toLowerCase();
    var rgb = parseHexColor(value) || parseRgbColor(value);

    if (rgb) {
      return rgbToHex(rgb);
    }

    if (namedColorMap[lowerValue]) {
      return namedColorMap[lowerValue];
    }

    return resolveCssColorName(value) || value;
  }

  function resolveCssColorName(color) {
    if (typeof document === 'undefined' || !document.body) {
      return null;
    }

    var probe = document.createElement('span');

    probe.style.color = '';
    probe.style.color = color;

    if (!probe.style.color) {
      return null;
    }

    var $probe = $(probe).css('display', 'none').appendTo(document.body);
    var computedColor = $probe.css('color');

    $probe.remove();

    var rgb = parseRgbColor(computedColor);
    return rgb ? rgbToHex(rgb) : null;
  }

  function rgbToHex(rgb) {
    return '#' + [rgb.red, rgb.green, rgb.blue].map(function (value) {
      return padHex(Math.max(0, Math.min(255, value)).toString(16));
    }).join('');
  }

  function normalizeViewMode(viewMode) {
    return ['day', 'week', 'month'].indexOf(viewMode) > -1 ? viewMode : 'day';
  }

  function getUnitWidth(options) {
    var viewMode = normalizeViewMode(options.viewMode);

    if (viewMode === 'week') {
      return options.weekWidth;
    }

    if (viewMode === 'month') {
      return options.monthWidth;
    }

    return options.dayWidth;
  }

  function startOfWeek(date) {
    var start = stripTime(date);
    var day = start.getDay();
    var diff = day === 0 ? -6 : 1 - day;

    start.setDate(start.getDate() + diff);
    return start;
  }

  function getUnitEnd(start, viewMode, chartEnd) {
    var end;

    if (viewMode === 'month') {
      end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    } else if (viewMode === 'week') {
      end = addDays(start, 6);
    } else {
      end = new Date(start);
    }

    return end > chartEnd ? new Date(chartEnd) : end;
  }

  function dateToOffset(date, units, unitWidth) {
    var target = stripTime(date);
    var offset = 0;

    for (var index = 0; index < units.length; index += 1) {
      var unit = units[index];
      var unitStart = stripTime(unit.start);
      var unitEnd = stripTime(unit.end);
      var unitEndExclusive = addDays(unitEnd, 1);

      if (target >= unitEndExclusive) {
        offset += unitWidth;
        continue;
      }

      if (target <= unitStart) {
        return offset;
      }

      return offset + (diffDays(unitStart, target) / Math.max(diffDays(unitStart, unitEndExclusive), 1)) * unitWidth;
    }

    return offset;
  }

  function getValue(item, key) {
    return item && key ? item[key] : undefined;
  }

  function copyExtraFields(source, target, excludeFields) {
    var excludeMap = {};

    excludeFields.forEach(function (field) {
      if (field) {
        excludeMap[field] = true;
      }
    });

    Object.keys(source || {}).forEach(function (key) {
      if (!excludeMap[key] && target[key] === undefined) {
        target[key] = source[key];
      }
    });
  }

  function hexToRgba(hex, alpha) {
    var rgb = parseHexColor(hex) || parseRgbColor(hex);

    if (!rgb) {
      return 'rgba(37, 99, 235, ' + alpha + ')';
    }

    return 'rgba(' + rgb.red + ', ' + rgb.green + ', ' + rgb.blue + ', ' + alpha + ')';
  }

  function getReadableTextColor(hex) {
    var rgb = parseHexColor(hex) || parseRgbColor(hex);

    if (!rgb) {
      return '#0f172a';
    }

    var luminance = ((rgb.red * 299) + (rgb.green * 587) + (rgb.blue * 114)) / 1000;
    return luminance < 145 ? '#ffffff' : '#0f172a';
  }

  function parseHexColor(hex) {
    if (!hex || typeof hex !== 'string') {
      return null;
    }

    var value = hex.replace('#', '');

    if (value.length === 3) {
      value = value.split('').map(function (char) {
        return char + char;
      }).join('');
    }

    if (!/^[0-9a-fA-F]{6}$/.test(value)) {
      return null;
    }

    var intValue = parseInt(value, 16);

    return {
      red: (intValue >> 16) & 255,
      green: (intValue >> 8) & 255,
      blue: intValue & 255
    };
  }

  function parseRgbColor(color) {
    if (!color || typeof color !== 'string') {
      return null;
    }

    var match = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);

    if (!match) {
      return null;
    }

    return {
      red: Number(match[1]),
      green: Number(match[2]),
      blue: Number(match[3])
    };
  }

  $.fn[pluginName] = function (optionsOrMethod) {
    var args = Array.prototype.slice.call(arguments, 1);

    return this.each(function () {
      var instance = $.data(this, pluginName);

      if (!instance) {
        $.data(this, pluginName, new CustomGantt(this, optionsOrMethod));
        return;
      }

      if (typeof optionsOrMethod === 'string' && typeof instance[optionsOrMethod] === 'function') {
        instance[optionsOrMethod].apply(instance, args);
      } else if ($.isPlainObject(optionsOrMethod)) {
        instance.update(optionsOrMethod);
      }
    });
  };

  $.fn[pluginName].defaults = defaults;
  $.customGantt = $.extend($.customGantt || {}, {
    buildHierarchy: buildHierarchy,
    colorThemes: colorThemes
  });
}));
