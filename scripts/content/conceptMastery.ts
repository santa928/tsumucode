/** Course内のConcept前提関係と、SlideからExerciseまでの習得段階を検証する。 */
import type {
  ConceptDefinition,
  CourseManifest,
  Lesson,
  MasteryLevel,
  Slide,
} from '../../src/core/content/types';

export type MasteryDiagnosticKind =
  | 'missing-introduction-slide'
  | 'introduction-slide-does-not-teach'
  | 'unmet-prerequisite'
  | 'unmet-requirement'
  | 'scaffold-target-mismatch'
  | 'missing-code-preview';

export interface MasteryDiagnostic {
  readonly kind: MasteryDiagnosticKind;
  readonly lessonId: string;
  readonly exerciseId?: string;
  readonly slideId?: string;
  readonly conceptId: string;
  readonly actualLevel: MasteryLevel | undefined;
  readonly requiredLevel: MasteryLevel;
}

const MASTERY_RANK: Readonly<Record<MasteryLevel, number>> = {
  seen: 0,
  read: 1,
  fill: 2,
  transform: 3,
  compose: 4,
};

/** 習得段階を単調比較可能な整数へ変換する。 */
export function masteryRank(level: MasteryLevel): number {
  return MASTERY_RANK[level];
}

/** 2つの習得段階のうち高い方を返す。 */
function higherLevel(left: MasteryLevel, right: MasteryLevel): MasteryLevel {
  return masteryRank(left) >= masteryRank(right) ? left : right;
}

/** Standard実習の到達目標を、実習開始前に必要なread段階へ変換する。 */
function standardExerciseEntryLevel(targetLevel: MasteryLevel): MasteryLevel {
  return masteryRank(targetLevel) >= masteryRank('read') ? 'read' : targetLevel;
}

/** Courseを公開順のLesson配列へ平坦化する。 */
function orderedLessons(course: CourseManifest): readonly Lesson[] {
  return course.phases.flatMap((phase) => phase.chapters.flatMap((chapter) => chapter.lessons));
}

/** Concept IDの一意性、前提参照、循環を検証して検索Mapを返す。 */
function validateConceptGraph(
  concepts: readonly ConceptDefinition[],
): ReadonlyMap<string, ConceptDefinition> {
  const byId = new Map<string, ConceptDefinition>();
  for (const concept of concepts) {
    if (byId.has(concept.id)) throw new Error(`Concept IDが重複しています: ${concept.id}`);
    byId.set(concept.id, concept);
  }
  for (const concept of concepts) {
    for (const prerequisiteId of concept.prerequisiteConceptIds) {
      if (!byId.has(prerequisiteId)) {
        throw new Error(
          `Concept prerequisiteの参照先がありません: ${concept.id}/${prerequisiteId}`,
        );
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (conceptId: string): void => {
    if (visiting.has(conceptId)) {
      throw new Error(`Concept prerequisiteが循環しています: ${conceptId}`);
    }
    if (visited.has(conceptId)) return;
    visiting.add(conceptId);
    const concept = byId.get(conceptId);
    if (concept === undefined) throw new Error(`Conceptがありません: ${conceptId}`);
    for (const prerequisiteId of concept.prerequisiteConceptIds) visit(prerequisiteId);
    visiting.delete(conceptId);
    visited.add(conceptId);
  };
  for (const concept of concepts) visit(concept.id);
  return byId;
}

/** 要求Conceptを前提優先の推移閉包へ展開し、重複を初出順で除く。 */
function collectPromotedConceptIdsFromGraph(
  concepts: ReadonlyMap<string, ConceptDefinition>,
  requiredConceptIds: readonly string[],
): readonly string[] {
  const promoted: string[] = [];
  const visited = new Set<string>();
  const visit = (conceptId: string): void => {
    if (visited.has(conceptId)) return;
    const concept = concepts.get(conceptId);
    if (concept === undefined) throw new Error(`Conceptがありません: ${conceptId}`);
    for (const prerequisiteId of concept.prerequisiteConceptIds) visit(prerequisiteId);
    visited.add(conceptId);
    promoted.push(conceptId);
  };
  for (const conceptId of requiredConceptIds) visit(conceptId);
  return promoted;
}

/** Exercise成功時に同じScaffold段階へ昇格する要求Conceptと全前提を返す。 */
export function collectPromotedConceptIds(
  concepts: readonly ConceptDefinition[],
  requiredConceptIds: readonly string[],
): readonly string[] {
  return collectPromotedConceptIdsFromGraph(validateConceptGraph(concepts), requiredConceptIds);
}

/** Slide IDと所属Lessonを検索できるMapへ変換し、重複を拒否する。 */
function indexSlides(
  lessons: readonly Lesson[],
): ReadonlyMap<string, { readonly lessonId: string; readonly slide: Slide }> {
  const slides = new Map<string, { readonly lessonId: string; readonly slide: Slide }>();
  for (const lesson of lessons) {
    for (const slide of lesson.slides) {
      if (slides.has(slide.id)) throw new Error(`Slide IDが重複しています: ${slide.id}`);
      slides.set(slide.id, { lessonId: lesson.id, slide });
    }
  }
  return slides;
}

/** Courseの習得Timelineを評価し、移行中に解消すべき不足を公開順で返す。 */
export function collectMasteryDiagnostics(course: CourseManifest): readonly MasteryDiagnostic[] {
  const concepts = validateConceptGraph(course.concepts);
  const lessons = orderedLessons(course);
  const slides = indexSlides(lessons);
  const diagnostics: MasteryDiagnostic[] = [];

  for (const concept of course.concepts) {
    const introduction = slides.get(concept.introducedBySlideId);
    if (introduction === undefined) {
      diagnostics.push({
        kind: 'missing-introduction-slide',
        lessonId: '',
        slideId: concept.introducedBySlideId,
        conceptId: concept.id,
        actualLevel: undefined,
        requiredLevel: 'seen',
      });
    } else if (!introduction.slide.teachesConceptIds.includes(concept.id)) {
      diagnostics.push({
        kind: 'introduction-slide-does-not-teach',
        lessonId: introduction.lessonId,
        slideId: introduction.slide.id,
        conceptId: concept.id,
        actualLevel: undefined,
        requiredLevel: 'seen',
      });
    }
  }

  const mastery = new Map<string, MasteryLevel>();
  const codePreviewAtRead = new Set<string>();
  const firstWritableRequirement = new Set<string>();
  for (const lesson of lessons) {
    for (const slide of lesson.slides) {
      for (const conceptId of slide.teachesConceptIds) {
        const concept = concepts.get(conceptId);
        if (concept === undefined) {
          throw new Error(`Slideが存在しないConceptを教えています: ${slide.id}/${conceptId}`);
        }
        const current = mastery.get(conceptId);
        if (current !== undefined && masteryRank(slide.masteryTarget) < masteryRank(current)) {
          throw new Error(
            `Concept習得Levelが後退しています: ${slide.id}/${conceptId}/${current}->${slide.masteryTarget}`,
          );
        }
        for (const prerequisiteId of concept.prerequisiteConceptIds) {
          const actualLevel = mastery.get(prerequisiteId);
          if (actualLevel === undefined) {
            diagnostics.push({
              kind: 'unmet-prerequisite',
              lessonId: lesson.id,
              slideId: slide.id,
              conceptId: prerequisiteId,
              actualLevel,
              requiredLevel: 'seen',
            });
          }
        }
        mastery.set(conceptId, slide.masteryTarget);
        if (
          slide.layout === 'code-preview' &&
          masteryRank(slide.masteryTarget) >= masteryRank('read')
        ) {
          codePreviewAtRead.add(conceptId);
        }
      }
    }

    for (const exercise of lesson.exercises) {
      for (const requirement of exercise.requiresConcepts) {
        const concept = concepts.get(requirement.conceptId);
        if (concept === undefined) {
          throw new Error(
            `Exerciseが存在しないConceptを要求しています: ${exercise.id}/${requirement.conceptId}`,
          );
        }
        const requiredLevel =
          lesson.kind === 'standard'
            ? standardExerciseEntryLevel(requirement.minimumLevel)
            : higherLevel(requirement.minimumLevel, concept.minimumProjectLevel);
        const exerciseTargetLevel =
          lesson.kind === 'standard' ? requirement.minimumLevel : requiredLevel;
        if (masteryRank(exercise.scaffoldLevel) < masteryRank(exerciseTargetLevel)) {
          diagnostics.push({
            kind: 'scaffold-target-mismatch',
            lessonId: lesson.id,
            exerciseId: exercise.id,
            conceptId: requirement.conceptId,
            actualLevel: exercise.scaffoldLevel,
            requiredLevel: exerciseTargetLevel,
          });
        }
        const actualLevel = mastery.get(requirement.conceptId);
        if (actualLevel === undefined || masteryRank(actualLevel) < masteryRank(requiredLevel)) {
          diagnostics.push({
            kind: 'unmet-requirement',
            lessonId: lesson.id,
            exerciseId: exercise.id,
            conceptId: requirement.conceptId,
            actualLevel,
            requiredLevel,
          });
        }
        if (
          masteryRank(exerciseTargetLevel) >= masteryRank('fill') &&
          !firstWritableRequirement.has(requirement.conceptId)
        ) {
          firstWritableRequirement.add(requirement.conceptId);
          if (!codePreviewAtRead.has(requirement.conceptId)) {
            diagnostics.push({
              kind: 'missing-code-preview',
              lessonId: lesson.id,
              exerciseId: exercise.id,
              conceptId: requirement.conceptId,
              actualLevel,
              requiredLevel: exerciseTargetLevel,
            });
          }
        }
      }
      const promotedConceptIds = collectPromotedConceptIdsFromGraph(
        concepts,
        exercise.requiresConcepts.map(({ conceptId }) => conceptId),
      );
      for (const conceptId of promotedConceptIds) {
        const current = mastery.get(conceptId);
        if (current === undefined || masteryRank(exercise.scaffoldLevel) > masteryRank(current)) {
          mastery.set(conceptId, exercise.scaffoldLevel);
        }
      }
    }
  }
  return diagnostics;
}

/** 構造違反または習得不足があるCourseを、位置情報付きErrorで拒否する。 */
export function assertCourseMastery(course: CourseManifest): void {
  const diagnostics = collectMasteryDiagnostics(course);
  const first = diagnostics[0];
  if (first === undefined) return;
  throw new Error(
    `Concept習得条件を満たしていません: kind=${first.kind} lesson=${first.lessonId} exercise=${first.exerciseId ?? '-'} slide=${first.slideId ?? '-'} concept=${first.conceptId} actual=${first.actualLevel ?? 'none'} required=${first.requiredLevel}`,
  );
}
