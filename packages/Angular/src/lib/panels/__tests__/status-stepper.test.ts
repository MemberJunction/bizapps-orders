/**
 * Stage-reachability tests.
 *
 * `BuildOrderStages` encodes the lifecycle rules the DB triggers enforce.
 */
import { describe, expect, it } from 'vitest';
import {
    BuildOrderStages,
    MJOStageChangeRequestEventArgs,
    type MJOOrderStage,
} from '../order-stages';

const reachable = (current: MJOOrderStage): MJOOrderStage[] =>
    BuildOrderStages(current)
        .filter((s) => s.Reachable)
        .map((s) => s.Stage);

describe('BuildOrderStages', () => {
    it('lists the commercial stages in fixed order', () => {
        expect(BuildOrderStages('Draft').map((s) => s.Stage)).toEqual([
            'Draft',
            'Quoted',
            'Confirmed',
        ]);
    });

    it('lets a Draft skip Quoted and go straight to Confirmed', () => {
        expect(reachable('Draft')).toEqual(['Quoted', 'Confirmed']);
    });

    it('lets a Quoted order confirm', () => {
        expect(reachable('Quoted')).toEqual(['Confirmed']);
    });

    it('offers nothing once an order is Confirmed', () => {
        expect(reachable('Confirmed')).toEqual([]);
    });

    it('lets a Voided order reopen to Draft or Quoted', () => {
        expect(reachable('Voided')).toEqual(['Draft', 'Quoted']);
    });

    it('warns that confirming is irreversible', () => {
        const confirm = BuildOrderStages('Draft').find((s) => s.Stage === 'Confirmed');
        expect(confirm!.Note).toMatch(/not undoable|exactly once/i);
    });
});

describe('MJOStageChangeRequestEventArgs', () => {
    it('starts un-cancelled and carries both stages', () => {
        const args = new MJOStageChangeRequestEventArgs('Draft', 'Confirmed');
        expect(args.Cancel).toBe(false);
        expect(args.From).toBe('Draft');
        expect(args.To).toBe('Confirmed');
    });

    it('can be cancelled with a reason', () => {
        const args = new MJOStageChangeRequestEventArgs('Draft', 'Confirmed');
        args.Cancel = true;
        args.CancelReason = 'pre-flight first';
        expect(args.Cancel).toBe(true);
        expect(args.CancelReason).toBe('pre-flight first');
    });
});
