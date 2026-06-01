# 数据库核心表

- users：用户
- choirs：合唱团
- sections：声部
- choir_members：成员关系和权限
- events：排练、演出、会议等活动
- event_responses：成员活动反馈
- attendance_records：考勤记录
- leave_requests：请假申请
- works：作品
- resources：谱子、伴奏、分声部音频等资料
- practice_tasks：练习任务
- practice_records：练习打卡
- comments：人工点评
- notifications：通知
- ai_reports：AI反馈预留

所有业务表均应通过 `choir_id` 进行数据隔离。
