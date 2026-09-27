import { useState } from 'react';
import { Link } from 'react-router';
import type { CourseIndex } from '../../core/content/types';
import { readReadingState } from './readingState';
import { resolveReadingResume } from './readingTargets';

/** 保存位置は明示した「続きから」でだけ採用し、直接URLを乗っ取らない。 */
export function ReadingResume({
  course,
  pilot,
}: {
  readonly course: CourseIndex;
  readonly pilot: boolean;
}) {
  const [saved] = useState(readReadingState);
  const position = saved.state.positions.find(
    (item) => item.scope === (pilot ? 'pilot' : 'library') && item.courseId === course.id,
  );
  if (!saved.available) return <p>この端末では読書の続き位置を保存できません。本文は読めます。</p>;
  if (saved.invalid) return <p>前の読書記録を復元できませんでした。目次から選んで読めます。</p>;
  if (!position) return null;
  const destination = resolveReadingResume(course, position, pilot);
  return (
    <p>
      <Link to={destination.path}>
        {destination.stale
          ? `${course.title}：以前の場所がないため目次へ`
          : `${course.title}：読書の続きから`}
      </Link>
    </p>
  );
}
