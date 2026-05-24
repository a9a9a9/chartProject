window.customGanttSampleData = [
  {
    large: '플랫폼 구축',
    children: [
      {
        medium: '기획',
        children: [
          {
            small: '요구사항 정의',
            start: '2026-05-01',
            end: '2026-05-08',
            progress: 100,
            color: '#2563eb'
          },
          {
            small: '화면 정책 정리',
            start: '2026-05-06',
            end: '2026-05-15',
            progress: 72,
            color: '#0891b2'
          }
        ]
      },
      {
        medium: '개발',
        children: [
          {
            small: '공통 컴포넌트',
            start: '2026-05-13',
            end: '2026-05-26',
            progress: 55,
            color: '#16a34a'
          },
          {
            small: '권한 관리',
            start: '2026-05-22',
            end: '2026-06-05',
            progress: 25,
            color: '#7c3aed'
          }
        ]
      }
    ]
  },
  {
    large: '운영 준비',
    children: [
      {
        medium: '검증',
        children: [
          {
            small: '통합 테스트',
            start: '2026-06-01',
            end: '2026-06-12',
            progress: 10,
            color: '#ea580c'
          },
          {
            small: '배포 리허설',
            start: '2026-06-15',
            end: '2026-06-19',
            progress: 0,
            color: '#dc2626'
          }
        ]
      }
    ]
  }
];
