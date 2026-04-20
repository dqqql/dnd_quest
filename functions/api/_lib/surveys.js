import { canFillChannel, canViewChannel, getChannelForUser } from './channels.js';

export async function getSurveyWithChannel(env, surveyId, userId) {
  const survey = await env.DB.prepare(`
    SELECT
      s.id,
      s.channel_id,
      s.title,
      s.description,
      s.creator_id,
      s.is_closed,
      s.is_deleted,
      s.created_at,
      s.updated_at,
      u.username AS creator_name
    FROM surveys s
    JOIN users u ON u.id = s.creator_id
    WHERE s.id = ? AND s.is_deleted = 0
  `).bind(surveyId).first();
  if (!survey) return null;

  const channel = await getChannelForUser(env, survey.channel_id, userId);
  return {
    ...survey,
    is_closed: Boolean(survey.is_closed),
    channel,
    can_view: canViewChannel(channel) || String(survey.creator_id) === String(userId),
    can_fill: !survey.is_closed && (canFillChannel(channel) || String(survey.creator_id) === String(userId)),
    can_edit: String(survey.creator_id) === String(userId),
    can_view_results: String(survey.creator_id) === String(userId),
  };
}

export async function getSurveyQuestions(env, surveyId) {
  const { results } = await env.DB.prepare('SELECT * FROM questions WHERE survey_id = ? ORDER BY order_num')
    .bind(surveyId)
    .all();
  return results.map((question) => ({
    ...question,
    options: question.options ? JSON.parse(question.options) : [],
    has_other: Boolean(question.has_other),
  }));
}

export function exportSurveyStructure(survey, questions) {
  return {
    title: survey.title,
    description: survey.description || '',
    questions: questions.map((question) => ({
      type: question.type,
      content: question.content,
      options: question.options?.length ? question.options : null,
      has_other: Boolean(question.has_other),
    })),
  };
}
