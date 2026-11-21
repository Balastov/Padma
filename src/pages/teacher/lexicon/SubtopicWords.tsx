import TermListEditor from './TermListEditor'

/** Words of a subtopic: list with removal and dictionary search to add. */
export default function SubtopicWords({
  subtopicId,
  onChanged,
}: {
  subtopicId: string
  onChanged: () => void
}) {
  return (
    <TermListEditor
      ownerId={subtopicId}
      path={`/lexicon/subtopics/${encodeURIComponent(subtopicId)}/terms`}
      caption="Слова подтемы"
      actionLabel="Добавить в подтему"
      removeLabel="Убрать из подтемы"
      onChanged={onChanged}
    />
  )
}
