# jQuery Custom Gantt

대/중/소 분류 데이터를 표현하는 심플한 jQuery 기반 Gantt chart 라이브러리입니다.

## 폴더 구조

```text
.
├── demo/                  # GitHub Pages 등에서 바로 볼 수 있는 샘플
├── data/                  # 샘플 JSON 데이터
├── dist/                  # 배포용 JS/CSS
├── src/                   # 개발 원본 JS/CSS
├── package.json
└── README.md
```

## 빠른 시작

```html
<link rel="stylesheet" href="./dist/jquery.custom-gantt.css" />
<script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
<script src="./dist/jquery.custom-gantt.js"></script>

<div id="chart"></div>

<script>
  $('#chart').customGantt({
    data: [
      {
        large: '서비스 구축',
        children: [
          {
            medium: '기획',
            children: [
              {
                small: '요구사항 정리',
                start: '2026-05-01',
                end: '2026-05-08',
                progress: 80
              }
            ]
          }
        ]
      }
    ]
  });
</script>
```

## 옵션

| 옵션 | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `data` | `Array` | `[]` | 대/중/소 구조의 Gantt 데이터 |
| `startDate` | `String|null` | `null` | 차트 시작일. 없으면 데이터에서 자동 계산 |
| `endDate` | `String|null` | `null` | 차트 종료일. 없으면 데이터에서 자동 계산 |
| `viewMode` | `String` | `day` | 날짜 보기 단위. `day`, `week`, `month` 지원 |
| `dayWidth` | `Number` | `34` | 하루 셀의 너비(px) |
| `weekWidth` | `Number` | `92` | 한 주 셀의 너비(px) |
| `monthWidth` | `Number` | `132` | 한 달 셀의 너비(px) |
| `rowHeight` | `Number` | `42` | 업무 행 높이(px) |
| `locale` | `String` | `ko-KR` | 날짜 표시 locale |
| `showToday` | `Boolean` | `true` | 오늘 표시선 출력 여부 |
| `initialCenterDate` | `String|Date|null` | `null` | 초기 렌더링 후 이동할 날짜. `YYYY-MM-DD`, `Date`, `today`, `start`, `end` 지원 |
| `initialCollapsed` | `Boolean` | `false` | 초기 렌더링 시 대/중분류를 모두 접은 상태로 시작할지 여부 |
| `initialExpandLevel` | `String|null` | `null` | 초기 렌더링 시 표시할 분류 단계. `large`, `medium`, `small` 지원 |
| `excludeWeekends` | `Boolean` | `false` | `day` 보기에서 토/일 날짜 컬럼을 제외할지 여부 |
| `colorTheme` | `String` | `default` | 색상이 없는 일정에 자동 적용할 기본 테마 |
| `ignoreDataColors` | `Boolean` | `false` | 데이터의 `color` 값을 무시하고 `colorTheme` 색상을 강제로 적용할지 여부 |
| `colorRenderer` | `Function|null` | `null` | 데이터 객체를 분석해서 bar 색상을 반환하는 함수. `blue`, `#2563eb`, `rgb(37, 99, 235)` 형식 지원 |
| `barLabelRenderer` | `Function|null` | `null` | bar 안에 표시할 텍스트를 반환하는 함수. 기본값은 `일정명 진행률%` |

`startDate`와 `endDate`를 지정하지 않으면 대/중/소분류 전체 데이터의 `start`, `end`를 분석해서 차트의 시작일과 종료일을 자동으로 정합니다.

## 보기 단위와 접기/펼치기

```js
$('#chart').customGantt({
  data: ganttData,
  viewMode: 'week',
  initialCenterDate: 'start',
  initialExpandLevel: 'medium',
  excludeWeekends: true,
  colorTheme: 'default',
  ignoreDataColors: true
});

$('#chart').customGantt({ viewMode: 'month' });
$('#chart').customGantt('collapseAll');
$('#chart').customGantt('expandAll');
$('#chart').customGantt('expandToLevel', 'medium');
```

`expandToLevel`은 `large`, `medium`, `small` 값을 받습니다. `large`는 대분류만, `medium`은 중분류까지, `small`은 소분류 작업까지 표시합니다.

대분류와 중분류 행은 차트에서 클릭하면 하위 일정을 접거나 펼칠 수 있습니다.
대분류와 중분류에 `start`, `end`, `progress`가 있으면 하위 일정 날짜와 무관하게 자신이 가진 일정 bar를 항상 표시합니다. 값이 없을 때만 하위 소분류 일정 기준으로 요약 일정이 계산됩니다.

## 색상 테마와 텍스트 대비

각 소분류 데이터에 `color`가 있으면 기본적으로 해당 색상을 그대로 사용합니다. `color`가 없으면 `colorTheme` 팔레트에서 자동으로 색상이 배정됩니다. `ignoreDataColors`를 켜면 데이터의 `color`를 무시하고 테마 색상을 강제로 적용합니다.

```js
$('#chart').customGantt({
  data: ganttData,
  colorTheme: 'default',
  ignoreDataColors: true,
  colorRenderer: function (item) {
    if (item.status === 'done') {
      return 'green';
    }

    if (item.status === 'risk') {
      return 'red';
    }

    return null;
  },
  barLabelRenderer: function (item, context) {
    return item.name + ' · ' + item.status + ' · ' + context.progress + '%';
  }
});
```

`colorRenderer`가 색상을 반환하면 데이터의 `color`보다 우선 적용됩니다. `null`이나 `undefined`를 반환하면 기존 규칙대로 데이터 `color`, 테마 팔레트 순서로 색상을 결정합니다.
`barLabelRenderer`도 `null`이나 `undefined`를 반환하면 기본 텍스트인 `일정명 진행률%`를 표시합니다.

bar 내부 텍스트 색상은 bar 색상의 밝기를 계산해서 어두운 색상에는 흰색, 밝은 색상에는 짙은 색으로 자동 표시됩니다.

## 데이터 구조

```js
[
  {
    large: '대분류',
    children: [
      {
        medium: '중분류',
        children: [
          {
            small: '소분류',
            start: '2026-05-01',
            end: '2026-05-10',
            progress: 40,
            color: '#3b82f6'
          }
        ]
      }
    ]
  }
]
```

## 분리 배열을 계층 데이터로 변환

대분류, 중분류, 소분류 배열을 따로 가지고 있다면 `$.customGantt.buildHierarchy`로 차트 입력 데이터로 변환할 수 있습니다.

```js
var largeList = [
  { id: 'L1', name: '플랫폼 개발', type: 'large', start: '2026-03-01', end: '2026-06-30', status: 'doing', progress: 38 }
];

var mediumList = [
  { id: 'M1', largeId: 'L1', name: '프론트엔드', type: 'medium', start: '2026-03-16', end: '2026-05-29', status: 'risk', progress: 48 }
];

var smallList = [
  {
    id: 'S1',
    mediumId: 'M1',
    name: '대시보드 화면',
    type: 'small',
    start: '2026-03-16',
    end: '2026-04-17',
    status: 'done',
    progress: 48,
    color: '#16a34a'
  }
];

var ganttData = $.customGantt.buildHierarchy(largeList, mediumList, smallList);

$('#chart').customGantt({
  data: ganttData
});
```

필드명이 다르면 네 번째 인자로 매핑할 수 있습니다.

```js
var ganttData = $.customGantt.buildHierarchy(largeList, mediumList, smallList, {
  largeId: 'largeCode',
  largeName: 'largeTitle',
  mediumId: 'mediumCode',
  mediumLargeId: 'largeCode',
  mediumName: 'mediumTitle',
  smallMediumId: 'mediumCode',
  smallName: 'taskTitle',
  start: 'startDate',
  end: 'endDate'
});
```

## 샘플 실행

GitHub Pages 같은 정적 호스팅에 올리면 루트 URL에서 데모를 바로 확인할 수 있습니다.

로컬에서 JSON 로딩까지 확인하려면 간단한 정적 서버를 사용하세요.

```bash
npx serve .
```

샘플 일정 데이터는 `data/project-schedule.json`에 있습니다.
