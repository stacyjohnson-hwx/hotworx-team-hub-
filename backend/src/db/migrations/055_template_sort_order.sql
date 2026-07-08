-- Ordering for touchpoint templates. Script Admin reorders these; the member
-- journey path renders its touchpoints in this order (mapped by template_key).
ALTER TABLE onboarding_touchpoint_templates ADD COLUMN IF NOT EXISTS sort_order integer;

UPDATE onboarding_touchpoint_templates SET sort_order = CASE template_key
  WHEN 'day0_orientation' THEN 10  WHEN 'day0_welcome_pos' THEN 15  WHEN 'day0_welcome_online' THEN 16
  WHEN 'day2_goal_call' THEN 20    WHEN 'day5_checkin' THEN 30      WHEN 'day21_bring_friend' THEN 40
  WHEN 'day30_review' THEN 50      WHEN 'day60_review' THEN 60      WHEN 'day90_close' THEN 70
  WHEN 'thank_you_card' THEN 80    WHEN 'passport_sticker' THEN 90
  WHEN 'milestone_10' THEN 110     WHEN 'milestone_25' THEN 120     WHEN 'milestone_50' THEN 130
  WHEN 'milestone_100' THEN 140    WHEN 'milestone_500' THEN 150    WHEN 'milestone_1000' THEN 160
  WHEN 'reengage_14' THEN 210      WHEN 'reengage_30' THEN 220      WHEN 'reengage_60' THEN 230
  WHEN 'birthday_text' THEN 310    WHEN 'birthday_text_nonmember' THEN 320
  ELSE 900 END
WHERE sort_order IS NULL;
