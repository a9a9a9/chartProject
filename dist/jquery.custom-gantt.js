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
  var colorThemes = {
    modern: ['#2563eb', '#0891b2', '#16a34a', '#7c3aed', '#ea580c', '#dc2626'],
    calm: ['#0f766e', '#3b82f6', '#64748b', '#84cc16', '#a855f7', '#f59e0b'],
    vivid: ['#e11d48', '#9333ea', '#0284c7', '#059669', '#ca8a04', '#db2777']
  };
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
    showToday: true,
    viewMode: 'day',
    initialCenterDate: null,
    initialCollapsed: false,
    excludeWeekends: false,
    colorTheme: 'modern'
  };

  function CustomGantt(element, options) {
    this.$element = $(element);
    this.eventNamespace = '.' + pluginName + instanceCount;
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
    this.init();
  }

  CustomGantt.prototype.init = function () {
    this.rows = flattenRows(this.options.data, this.options);
    this.applyInitialCollapsedState();
    this.units = buildUnits(this.options, this.rows);
    this.render();
  };

  CustomGantt.prototype.update = function (options) {
    this.options = $.extend({}, this.options, options);
    this.init();
  };

  CustomGantt.prototype.destroy = function () {
    $(document).off(this.eventNamespace);
    this.closeTaskContextMenu();
    this.hideTaskTooltip();
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

  CustomGantt.prototype.applyInitialCollapsedState = function () {
    var self = this;

    if (this.initialStateApplied) {
      return;
    }

    if (this.options.initialCollapsed) {
      this.rows.forEach(function (row) {
        if (row.type !== 'small') {
          self.collapsed[row.id] = true;
        }
      });
    }

    this.initialStateApplied = true;
  };

  CustomGantt.prototype.render = function () {
    var opts = this.options;
    this.$element
      .empty()
      .addClass('custom-gantt')
      .toggleClass('is-sidebar-collapsed', this.sidebarCollapsed);

    if (!this.rows.length || !this.units.length) {
      this.$element.append($('<div class="cg-empty">').text('표시할 일정 데이터가 없습니다.'));
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
    var gridTemplate = 'repeat(' + this.units.length + ', ' + unitWidth + 'px)';

    $toolbar.append($title, $range);
    $sidebar.append(
      $('<div class="cg-header-cell">')
        .append($('<span class="cg-header-title">').text('분류 / 작업'))
        .append(
          $('<div class="cg-header-actions">')
            .append(renderSidebarToggleButton(this.sidebarCollapsed))
        )
    );
    visibleRows.forEach(function (row) {
      var $label = $('<div class="cg-row-label">')
        .addClass('is-' + row.type)
        .toggleClass('is-collapsible', row.type !== 'small')
        .toggleClass('is-collapsed', !!this.collapsed[row.id])
        .toggleClass('is-entering', !!enteringRowIds[row.id])
        .attr('data-row-id', row.id)
        .css('height', opts.rowHeight);

      if (row.type !== 'small') {
        $label.append($('<button class="cg-toggle" type="button" aria-label="분류 접기/펼치기">'));
      }

      $sidebar.append(
        $label.append($('<span class="cg-label-text">').text(row.label))
      );
    }, this);

    $timeline.append(this.renderUnits(gridTemplate));
    $timeline.append(this.renderRows(gridTemplate, visibleRows, enteringRowIds));

    if (opts.showToday) {
      appendTodayLine($timeline, this.units, unitWidth);
    }

    $board.append($sidebar, $timeline);
    $scroll.append($board);
    this.$element.append($toolbar, $scroll);
    this.bindCollapseEvents();
    this.bindDragScroll();
    this.bindTaskContextMenu();
    this.bindTaskHoverBar();
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
    var $rows = $('<div class="cg-rows">');

    visibleRows.forEach(function (row) {
      var $gridRow = $('<div class="cg-grid-row">')
        .toggleClass('is-group', row.type !== 'small')
        .toggleClass('is-entering', !!enteringRowIds[row.id])
        .attr('data-row-id', row.id)
        .css({
          gridTemplateColumns: gridTemplate,
          height: opts.rowHeight
        });

      self.units.forEach(function (unit) {
        $gridRow.append($('<div class="cg-grid-cell">').toggleClass('is-weekend', unit.isWeekend));
      });

      if (row.type === 'small' || (self.collapsed[row.id] && row.start && row.end)) {
        if (row.isSummary) {
          $gridRow.append(renderSummaryLead(row, self.units, unitWidth));
        }
        $gridRow.append(renderTaskBar(row, self.units, unitWidth, opts));
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
        .attr('aria-label', self.sidebarCollapsed ? '분류 영역 보이기' : '분류 영역 숨기기')
        .attr('title', self.sidebarCollapsed ? '분류 영역 보이기' : '분류 영역 숨기기');
    });

    this.$element.find('.cg-row-label.is-collapsible').on('click', function () {
      var rowId = $(this).attr('data-row-id');
      self.toggleRow(rowId);
    });
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
    var typeText = row.isSummary ? '요약 일정' : '작업 일정';
    var $menu = $('<div class="cg-context-menu" role="menu">')
      .append($('<div class="cg-context-title">').text(row.label))
      .append(renderContextRow('유형', typeText))
      .append(renderContextRow('기간', formatDate(row.start, opts.locale) + ' - ' + formatDate(row.end, opts.locale)))
      .append(renderContextRow('진행률', row.progress + '%'));

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

  CustomGantt.prototype.applyInitialCenterScroll = function () {
    var self = this;
    var centerDate = parseDate(this.options.initialCenterDate);

    if (this.initialScrollApplied || !centerDate || !this.units.length) {
      return;
    }

    this.initialScrollApplied = true;
    if (window.requestAnimationFrame) {
      window.requestAnimationFrame(function () {
        self.scrollToDate(centerDate);
      });
    } else {
      window.setTimeout(function () {
        self.scrollToDate(centerDate);
      }, 0);
    }
  };

  CustomGantt.prototype.scrollToDate = function (date) {
    var $scroll = this.$element.find('.cg-scroll');
    var unitWidth = getUnitWidth(this.options);
    var sidebarWidth = this.$element.find('.cg-sidebar').outerWidth() || 0;
    var viewportWidth = Math.max($scroll.innerWidth() - sidebarWidth, 0);
    var targetOffset = dateToOffset(date, this.units, unitWidth);
    var scrollLeft = Math.max(targetOffset - (viewportWidth / 2), 0);

    $scroll.scrollLeft(scrollLeft);
  };

  function renderToggleAllButton(rows, collapsed) {
    var isCollapsed = areAllGroupsCollapsed(rows, collapsed);
    var label = isCollapsed ? '전체 펼치기' : '전체 접기';

    return $('<button class="cg-toggle-all" type="button">')
      .toggleClass('is-collapsed', isCollapsed)
      .attr('aria-label', label)
      .attr('title', label);
  }

  function renderSidebarToggleButton(isCollapsed) {
    var label = isCollapsed ? '분류 영역 보이기' : '분류 영역 숨기기';

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

      rows.push({ type: 'large', id: largeId, label: largeGroup.large || largeGroup.name || '대분류' });

      (largeGroup.children || []).forEach(function (mediumGroup, mediumIndex) {
        var mediumId = largeId + '-medium-' + mediumIndex;

        rows.push({ type: 'medium', id: mediumId, parentId: largeId, label: mediumGroup.medium || mediumGroup.name || '중분류' });

        (mediumGroup.children || []).forEach(function (task) {
          var taskColor = task.color || palette[colorIndex % palette.length];

          rows.push({
            type: 'small',
            id: mediumId + '-small-' + rows.length,
            parentId: mediumId,
            label: task.small || task.name || '작업',
            start: parseDate(task.start),
            end: parseDate(task.end),
            progress: clamp(task.progress || 0, 0, 100),
            color: taskColor
          });
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

      row.start = minDate(tasks.map(function (task) {
        return task.start;
      }));
      row.end = maxDate(tasks.map(function (task) {
        return task.end;
      }));
      row.progress = Math.round(tasks.reduce(function (sum, task) {
        return sum + task.progress;
      }, 0) / tasks.length);
      row.isSummary = true;
    });

    return rows;
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
      smallMediumId: 'mediumId',
      smallName: 'name',
      start: 'start',
      end: 'end',
      progress: 'progress',
      color: 'color'
    }, options);
    var largeMap = {};
    var mediumMap = {};
    var hierarchy = [];

    (largeList || []).forEach(function (largeItem) {
      var largeId = getValue(largeItem, fields.largeId);
      var largeGroup = {
        large: getValue(largeItem, fields.largeName) || largeItem.large || '대분류',
        children: []
      };

      copyExtraFields(largeItem, largeGroup, [fields.largeId, fields.largeName, 'large', 'children']);
      largeMap[largeId] = largeGroup;
      hierarchy.push(largeGroup);
    });

    (mediumList || []).forEach(function (mediumItem) {
      var mediumId = getValue(mediumItem, fields.mediumId);
      var parentLargeId = getValue(mediumItem, fields.mediumLargeId);
      var largeGroup = largeMap[parentLargeId];
      var mediumGroup = {
        medium: getValue(mediumItem, fields.mediumName) || mediumItem.medium || '중분류',
        children: []
      };

      copyExtraFields(mediumItem, mediumGroup, [
        fields.mediumId,
        fields.mediumLargeId,
        fields.mediumName,
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
        small: getValue(smallItem, fields.smallName) || smallItem.small || '작업',
        start: getValue(smallItem, fields.start),
        end: getValue(smallItem, fields.end),
        progress: getValue(smallItem, fields.progress) || 0
      };
      var color = getValue(smallItem, fields.color);

      if (color) {
        task.color = color;
      }

      copyExtraFields(smallItem, task, [
        fields.smallMediumId,
        fields.smallName,
        fields.start,
        fields.end,
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
        ends.push(row.end);
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

  function renderTaskBar(row, units, unitWidth, options) {
    var metrics = getTaskBarMetrics(row, units, unitWidth);

    if (!metrics) {
      return $();
    }

    var color = row.color || (row.isSummary ? '#334155' : getColorPalette(options.colorTheme)[0]);
    var textColor = getReadableTextColor(color);
    var $bar = $('<div class="cg-task-bar">')
      .toggleClass('is-summary', !!row.isSummary)
      .data('taskRow', row)
      .css({ left: metrics.left, width: metrics.width });
    var $progress = $('<div class="cg-task-progress">').css('width', row.progress + '%');
    var $name = $('<div class="cg-task-name">')
      .css('color', textColor)
      .append($('<span class="cg-task-name-text">').text(row.label + ' ' + row.progress + '%'));

    if (color) {
      $bar.css({
        background: hexToRgba(color, 0.16),
        boxShadow: 'inset 0 0 0 1px ' + hexToRgba(color, 0.22)
      });
      $progress.css('background', color);
    }

    return $bar.append($progress, $name);
  }

  function renderSummaryLead(row, units, unitWidth) {
    var metrics = getTaskBarMetrics(row, units, unitWidth);

    if (!metrics || metrics.left <= 12) {
      return $();
    }

    return $('<div class="cg-summary-lead">').css({
      left: 3,
      width: metrics.left - 6
    });
  }

  function getTaskBarMetrics(row, units, unitWidth) {
    var start = stripTime(row.start);
    var end = stripTime(row.end);

    if (!start || !end) {
      return null;
    }

    var startOffset = dateToOffset(start, units, unitWidth);
    var endOffset = dateToOffset(addDays(end, 1), units, unitWidth);

    return {
      left: startOffset + 3,
      width: Math.max(endOffset - startOffset - 6, 8)
    };
  }

  function appendTodayLine($timeline, units, unitWidth) {
    var today = stripTime(new Date());
    var start = stripTime(units[0].start);
    var end = stripTime(units[units.length - 1].end);

    if (today < start || today > end) {
      return;
    }

    $timeline.append(
      $('<div class="cg-today-line">').css('left', dateToOffset(today, units, unitWidth))
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
      return String(unit.start.getMonth() + 1) + '월';
    }

    if (unit.viewMode === 'week') {
      return (unit.start.getMonth() + 1) + '/' + unit.start.getDate() + '주';
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

  function clamp(value, min, max) {
    return Math.min(Math.max(Number(value) || 0, min), max);
  }

  function renderContextRow(label, value) {
    return $('<div class="cg-context-row">')
      .append($('<span class="cg-context-label">').text(label))
      .append($('<span class="cg-context-value">').text(value));
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
    return colorThemes[themeName] || colorThemes.modern;
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
    var rgb = parseHexColor(hex);

    if (!rgb) {
      return 'rgba(37, 99, 235, ' + alpha + ')';
    }

    return 'rgba(' + rgb.red + ', ' + rgb.green + ', ' + rgb.blue + ', ' + alpha + ')';
  }

  function getReadableTextColor(hex) {
    var rgb = parseHexColor(hex);

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
