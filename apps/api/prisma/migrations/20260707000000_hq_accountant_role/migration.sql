-- Enum value must be committed in its own migration before it can be referenced.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'HQ_ACCOUNTANT';
