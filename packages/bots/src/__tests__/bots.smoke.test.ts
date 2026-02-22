import {
  patientOnboardingHandler,
  labResultProcessorHandler,
  epicSyncHandler,
  cernerSyncHandler,
  athenaSyncHandler,
  adtHandler,
  oruHandler,
  siuHandler,
} from '..';

describe('bots smoke tests', () => {
  const handlers = {
    patientOnboardingHandler,
    labResultProcessorHandler,
    epicSyncHandler,
    cernerSyncHandler,
    athenaSyncHandler,
    adtHandler,
    oruHandler,
    siuHandler,
  };

  it('exports all 8 handlers', () => {
    expect(Object.keys(handlers)).toHaveLength(8);
  });

  it('patientOnboardingHandler is a function', () => {
    expect(typeof patientOnboardingHandler).toBe('function');
  });

  it('labResultProcessorHandler is a function', () => {
    expect(typeof labResultProcessorHandler).toBe('function');
  });

  it('epicSyncHandler is a function', () => {
    expect(typeof epicSyncHandler).toBe('function');
  });

  it('cernerSyncHandler is a function', () => {
    expect(typeof cernerSyncHandler).toBe('function');
  });

  it('athenaSyncHandler is a function', () => {
    expect(typeof athenaSyncHandler).toBe('function');
  });

  it('adtHandler is a function', () => {
    expect(typeof adtHandler).toBe('function');
  });

  it('oruHandler is a function', () => {
    expect(typeof oruHandler).toBe('function');
  });

  it('siuHandler is a function', () => {
    expect(typeof siuHandler).toBe('function');
  });
});
