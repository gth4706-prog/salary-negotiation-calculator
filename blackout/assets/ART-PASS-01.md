# BLACKOUT · 자체 제작 아트 1차 적용

> 아래는 최초 v0.9 적용 기록이다. 현재는 v1.2 기반으로 이식됐으며 최신 작업 위치·규칙·검증은 ../WORKPLAN.md를 따른다.

2026-09-14 · 규칙 v0.9 유지 · 내장 image_gen 사용 · 힉스필드 호출/크레딧 사용 0

## 작업 원칙

기존 게임 이미지는 미감의 참고 자료로 사용하지 않았다. 모든 채택 원화는 assets/concept/concept-01.jpg를 재질·분위기·캐릭터 정체성 참조로 사용했다. 원본의 입체적인 실내 감성을 게임의 칸 분할 구조에 맞추는 첫 단계다. 아직 출시용 아트 전체 완성은 아니다.

## 채택 및 실제 적용

| 자산 | 런타임 파일 | 상태 |
|---|---|---|
| 후드·고글·페인트건 전신 캐릭터 | sprites/kid-full.png · 256×256 RGBA | 새로 생성. 한 포즈를 사용하며 방향은 기존 화살표가 나타냄 |
| 사무실 책상 | furniture/desk-3x1.png · 600×200 RGBA | 새로 생성. 원근 그림을 늘리지 않고 비율을 유지해 맞춤 |
| 작은 책상 | furniture/desk-2x1.png · 400×200 RGBA | 별도 생성. 3×1 그림을 줄여 변형한 자산이 아님. 이 파일을 공유하는 거실 탁자에도 적용됨 |
| 사무실 마루 | rooms/office.jpg · 800×800 | 새로 생성. 빈 마루, 조명과 페인트는 런타임 처리 |

원본 고해상도 결과는 outputs/blackout-art-pass-01에 보존했다. 생성 PNG의 알파 채널을 검사하고 종횡비를 유지해 축소·여백 정리했다. 생성된 이미지를 코드로 다시 그리지는 않았다.

## 코드 적용

- 얼굴을 덮어 채우던 원형 배지 대신 전신 투명 스프라이트를 contain으로 표시.
- 캐릭터 아래 작은 청록/분홍 표식으로 구분. 일러스트 자세로 상대의 실제 방향을 전달하지 않음.
- 피격 야광은 새 캐릭터 알파를 마스크로 사용. 상대가 숨겨지면 본체와 야광 모두 제거.
- 가구의 투명 여백 아래에 같은 방의 마루를 합성. 공개되지 않은 칸은 이 합성에서 제외.
- 연속 바닥에 칸별 밝기 편차를 중첩하지 않음.
- 페인트 하이라이트는 코드로 추가. 영구 얼룩·발자국 규칙은 유지.
- 캐시 태그 0.9-art1. 규칙 및 네트워크 버전은 변경하지 않음.

## 제외한 후보와 다음 과제

의자 원화 1회와 배경 제거 수정 1회, 수납장 원화 1회는 실제 알파가 없는 RGB 체크무늬 배경이라 적용하지 않았다. 출력이 그럴듯해 보여도 배경과 규격 검사를 통과하지 못하면 채택하지 않는다. 이번 내장 이미지 생성 7회 중 4개 결과만 적용했다. 이것은 힉스필드 7회 사용을 의미하지 않는다.

사무실 의자·수납장·책장·서류는 기존 자산이다. 침실·거실도 전체 교체하지 않았다. 네 방향 전신 원화, 침대·소파 등은 다음 제작 과제다. 부적합한 투명 이미지가 반복되면 동일 요청을 계속 재시도하기 전에 제작 방법을 바꾼다. 힉스필드로 자동 전환하지 않는다.

지출 순서: 내장 생성/코드 제작 → 실제 크기 적용 → 부족한 부분 특정 → 유료 도구가 필요한 경우에만 구체적 견적과 사용자 조율. 이전 80크레딧 예산안은 승인이나 기본 지출 계획이 아니다.

## 검증과 상태

추가 브라우저 검사: 전신 파일 로드, 전신에 맞는 피격 마스크, 턴 이후 상대 숨김, 지연 이미지의 미공개 칸 오염 방지 확인. 규칙 테스트 166개 통과. 화면 7종 검증 결과는 작업 완료 보고를 따른다.

office-light-on.png와 office-paint-dark.png는 실제 게임 렌더러에 검수용 고정 상태를 넣어 촬영한 이미지다. 전등 점등 시 가구가 모두 공개되는 상태와, 그 후 불이 꺼져 페인트·기억만 남는 상태를 비교한다. 실제 온라인 대전 녹화나 새로운 규칙 제안이 아니다.

작업 경로: C:\Users\gth39\Documents\Codex\2026-09-13\g\work\blackout-v09-review\blackout
브랜치: codex/blackout-art-review-v09
main 병합·실서비스 배포는 실행하지 않았다.

## 사용한 최종 프롬프트

모든 입력 이미지의 역할: concept-01.jpg = style and identity reference, not edit target or runtime layout. 실행 경로: built-in image_gen, not Higgsfield, not paid API fallback.

### 전신 캐릭터

Use case: stylized-concept. Create ONE production game sprite, genuine transparent background PNG. Reference image is STYLE AND CHARACTER IDENTITY only, not output layout. Match its bottom-right mustard hoodie child: tousled dark brown hair, chunky protective clear goggles, mustard yellow hoodie, denim shorts, sneakers, bright blue toy paintgun with coral reservoir. Soft tactile high quality 3D storybook materials, adorable oversized head small full body. CAMERA: overhead game token, almost vertical top-down as the SMALL overhead child in reference, facing screen DOWN, face slightly readable but clearly overhead (not front-facing standing portrait). Full head, torso, both hands, gun and feet within square, no cropping. Occupy about 84% of square height, centered horizontally. Gun points toward bottom-right within token footprint. Only one child one pose, no sheet, no text, no floor, no grid, no neon ring, no badge, no paint on clothing, no cast shadow background. Match reference exactly in warmth and craftsmanship; no futuristic armor. Export transparent background with clean alpha edges.

### 책상 3×1

Use case stylized-concept. Production game furniture sprite. Reference only for tactile warm everyday indoor concept art aesthetic. Generate ONE wide wooden office desk as a clean isolated TRANSPARENT PNG. EXACT camera vertical overhead orthographic top-down, desktop rectangular edges horizontal and vertical, no front elevation, no visible legs, no perspective. Desk footprint aspect ratio 3:1, centered in a wide landscape canvas with minimal transparent margin. Entire desk contained. Walnut wood warm caramel brown softly rounded corners, beautiful subtle grain and small worn edges; a black monitor seen directly from ABOVE along back/top edge, compact cream keyboard below it, mug on left, stack of 3 ivory papers on right, closed teal notebook. Coherent handmade premium 3D storybook material matching reference, restrained details readable at 150x50px. Neutral soft illumination, no baked spotlight, no room, no floor, no chair, no neon paint, no shadows outside object, no text no labels. This is a dedicated orthographic asset, do not crop or stretch reference.

### 책상 2×1

Create a single isolated compact wooden writing desk game asset on genuinely transparent alpha background. PNG cutout like a product sprite, no checkerboard pattern. Match reference soft tactile storybook 3D cozy office aesthetic. Perfectly orthographic overhead top-down camera, not front or isometric. Wide desktop footprint 2:1. Warm walnut wood rounded rectangle, a closed muted teal laptop in upper-right, ivory notebook with pencil on left, one small ceramic mug near rear edge. No chair, no floor, no surrounding scene, no external shadow. Neutral soft illumination. Compose horizontal rectangle centered, fit entire silhouette with small margins; export landscape canvas 2:1. Readable at100x50 pixels. No text or watermark or neon.

### 마루

Use case stylized-concept. A production game floor texture for the office from the reference. Generate a square 1:1 full-bleed clean wood floor, CAMERA perfectly vertical orthographic. Reference is mood and materials only. Warm medium walnut / muted chestnut wooden planks, softly hand-crafted 3D illustration texture matching cozy everyday interior in reference, understated grain, gently rounded worn seams. Approximately 16 horizontal courses of floorboards across the whole square, long staggered planks with varied lengths and restrained warm brown tones. This square covers an entire eight by eight game room. Completely empty. NO furniture, rug, wall, trim, objects, paint, people, text, symbols, tile grid, mirror repetition, checkerboard, strong knots or deep black gaps. Uniform neutral illumination with no vignette, no spotlights and no cast shadows: all game lighting is added at runtime. Rich but restrained material detail readable at 800x800. Not photorealistic construction catalog; tactile premium storybook game material. Fill to all four edges.
