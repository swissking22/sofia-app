import {
  progressFromLeafTopics,
  expectedPercent,
  scheduleStatus,
  coverageFromLog,
  advanceCoverage,
  type TeachingLogStatus,
  type TopicCoverageStatus,
} from '../domain/teaching-progress'

export type TopicRec = {
  id: string
  parent_id: string | null
  coverage_status: TopicCoverageStatus
}

export class TeachingProgressService {
  constructor(public topics: TopicRec[]) {}

  recordLog(topicId: string, status: TeachingLogStatus): TopicRec {
    const topic = this.topics.find((t) => t.id === topicId)
    if (!topic) throw new Error('Topic not found.')
    const next = coverageFromLog(status)
    if (next) topic.coverage_status = advanceCoverage(topic.coverage_status, next)
    return topic
  }

  snapshot(yearStart: string, yearEnd: string, today: string) {
    const counts = progressFromLeafTopics(this.topics)
    const expected = expectedPercent({ yearStart, yearEnd, today })
    return {
      ...counts,
      expected,
      schedule: scheduleStatus(expected, counts.percent),
    }
  }
}
