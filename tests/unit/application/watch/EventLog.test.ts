import { EventLog } from '../../../../src/application/watch/EventLog';
import { FileChangeEvent } from '../../../../src/application/watch/FileWatcher';

describe('EventLog', () => {
  let eventLog: EventLog;

  beforeEach(() => {
    eventLog = new EventLog();
  });

  describe('logWatchStart/logWatchStop', () => {
    it('should record watch start and stop events', () => {
      eventLog.logWatchStart('/source', '/output');
      eventLog.logWatchStop();

      const events = eventLog.getEvents();
      expect(events.length).toBe(2);
      expect(events[0].type).toBe('watch-start');
      expect(events[1].type).toBe('watch-stop');
    });
  });

  describe('logFileChange', () => {
    it('should log file add events', () => {
      eventLog.logFileChange('add', '/source/note.md');

      const events = eventLog.getEvents();
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('file-add');
      expect(events[0].filePath).toBe('/source/note.md');
    });

    it('should log file change events', () => {
      eventLog.logFileChange('change', '/source/note.md');

      const events = eventLog.getEvents();
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('file-change');
    });

    it('should log file delete events', () => {
      eventLog.logFileChange('unlink', '/source/note.md');

      const events = eventLog.getEvents();
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('file-delete');
    });
  });

  describe('logConversionStart/logFileConversion', () => {
    it('should log conversion batch start', () => {
      eventLog.logConversionStart(['/source/note1.md', '/source/note2.md']);

      const events = eventLog.getEvents();
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('conversion-start');
      expect(events[0].data?.fileCount).toBe(2);
    });

    it('should log successful file conversion', () => {
      eventLog.logFileConversion({
        filePath: '/source/note.md',
        outputPath: '/output/note.md',
        success: true,
        wikiLinkCount: 5,
        calloutCount: 2,
        durationMs: 100,
      });

      const events = eventLog.getEvents();
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('conversion-complete');
      expect(events[0].data?.success).toBe(true);
    });

    it('should log failed file conversion', () => {
      eventLog.logFileConversion({
        filePath: '/source/note.md',
        outputPath: '',
        success: false,
        wikiLinkCount: 0,
        calloutCount: 0,
        error: 'File not found',
        durationMs: 50,
      });

      const events = eventLog.getEvents();
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('conversion-error');
      expect(events[0].data?.success).toBe(false);
      expect(events[0].data?.error).toBe('File not found');
    });
  });

  describe('getConversionSummary', () => {
    it('should calculate correct summary', () => {
      eventLog.logFileConversion({
        filePath: '/source/note1.md',
        outputPath: '/output/note1.md',
        success: true,
        wikiLinkCount: 5,
        calloutCount: 2,
        durationMs: 100,
      });

      eventLog.logFileConversion({
        filePath: '/source/note2.md',
        outputPath: '/output/note2.md',
        success: true,
        wikiLinkCount: 3,
        calloutCount: 1,
        durationMs: 150,
      });

      eventLog.logFileConversion({
        filePath: '/source/note3.md',
        outputPath: '',
        success: false,
        wikiLinkCount: 0,
        calloutCount: 0,
        error: 'Parse error',
        durationMs: 50,
      });

      const summary = eventLog.getConversionSummary();
      expect(summary.totalFiles).toBe(3);
      expect(summary.successCount).toBe(2);
      expect(summary.failedCount).toBe(1);
      expect(summary.totalDurationMs).toBe(300);
      expect(summary.averageDurationMs).toBe(100);
    });
  });

  describe('getSessionSummary', () => {
    it('should return complete session summary', () => {
      eventLog.logWatchStart('/source', '/output');
      eventLog.logFileChange('add', '/source/note1.md');
      eventLog.logFileChange('change', '/source/note2.md');
      eventLog.logFileChange('unlink', '/source/note3.md');
      eventLog.logWatchStop();

      const summary = eventLog.getSessionSummary();
      expect(summary.filesAdded).toBe(1);
      expect(summary.filesChanged).toBe(1);
      expect(summary.filesDeleted).toBe(1);
      expect(summary.totalFileChanges).toBe(3);
      expect(summary.watchDuration).not.toBeNull();
    });
  });

  describe('formatSummary', () => {
    it('should format summary as string', () => {
      eventLog.logWatchStart('/source', '/output');
      eventLog.logFileConversion({
        filePath: '/source/note.md',
        outputPath: '/output/note.md',
        success: true,
        wikiLinkCount: 5,
        calloutCount: 2,
        durationMs: 100,
      });
      eventLog.logWatchStop();

      const formatted = eventLog.formatSummary();
      expect(formatted).toContain('Watch Mode Summary');
      expect(formatted).toContain('Duration:');
      expect(formatted).toContain('Conversion Results');
    });
  });

  describe('clear', () => {
    it('should clear all events', () => {
      eventLog.logWatchStart('/source', '/output');
      eventLog.logFileChange('add', '/source/note.md');
      eventLog.clear();

      expect(eventLog.getEvents().length).toBe(0);
    });
  });

  describe('getRecentEvents', () => {
    it('should return last n events', () => {
      for (let i = 0; i < 15; i++) {
        eventLog.logFileChange('change', `/source/note${i}.md`);
      }

      const recent = eventLog.getRecentEvents(5);
      expect(recent.length).toBe(5);
    });
  });

  describe('getEventsByType', () => {
    it('should filter events by type', () => {
      eventLog.logFileChange('add', '/source/note1.md');
      eventLog.logFileChange('change', '/source/note2.md');
      eventLog.logFileChange('add', '/source/note3.md');

      const addEvents = eventLog.getEventsByType('file-add');
      expect(addEvents.length).toBe(2);
    });
  });
});