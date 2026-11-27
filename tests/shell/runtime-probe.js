import GLib from 'gi://GLib';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {exercise, disabled} from './exercise.js';

const wait = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
    resolve();
    return GLib.SOURCE_REMOVE;
}));
const expect = (condition, message) => {
    if (!condition)
        throw new Error(message);
};

export default class RuntimeProbe extends Extension {
    enable() {
        // Session-mode changes and extension-order reloads can call enable()
        // again while the first asynchronous observation is still running.
        if (this._started)
            return;
        this._started = true;
        const run = () => this.runChecks()
            .then(() => console.log('RUNTIME-ACCEPTANCE result: pass'))
            .catch(error => console.log(`RUNTIME-ACCEPTANCE result: fail: ${error}\n${error.stack}`))
            .finally(() => console.log('RUNTIME-ACCEPTANCE done'));
        if (Main.layoutManager._startingUp)
            Main.layoutManager.connectObject('startup-complete', run, this);
        else
            run();
    }

    disable() {
        Main.layoutManager.disconnectObject(this);
    }

    async runChecks() {
        const uuid = GLib.getenv('RUNTIME_EXTENSION_UUID');
        const manager = Main.extensionManager;
        const extension = () => manager.lookup(uuid);
        const state = async (expected, target = uuid) => {
            for (let i = 0; i < 50; i++) {
                const current = manager.lookup(target);
                if (current?.state === expected)
                    return;
                // loadExtension uses ERROR provisionally while awaiting its
                // module import. A nonempty error is an actual load failure.
                if (current?.state === 3 && current?.error)
                    throw new Error(`Extension failed: ${current.error}`);
                await wait(100);
            }
            throw new Error(`${target} state ${manager.lookup(target)?.state}, expected ${expected}`);
        };
        const trigger = 'reload-trigger@extensions.test';
        const gateId = 'reload-gate@extensions.test';
        const activitiesWasVisible = Main.panel.statusArea.activities?.visible;
        for (const target of [trigger, gateId, uuid]) {
            manager.enableExtension(target);
            await state(1, target);
        }
        Main.overview.hide();
        await exercise(extension().stateObj, {wait, expect, phase: 'initial'});
        expect(Main.sessionMode.currentMode === GLib.getenv('RUNTIME_SHELL_MODE'), 'Unexpected GNOME Shell session mode');
        if (Main.sessionMode.currentMode === 'ubuntu')
            expect(Main.layoutManager.monitors.length === 2, 'Expected two Ubuntu session monitors');
        // Shell temporarily disables later extensions and awaits each peer's
        // re-enable. Disable Workspace Bar from settings during that interval.
        const gate = manager.lookup(gateId).stateObj;
        let resumed;
        let waiting = false;
        gate.onEnable = () => new Promise(resolve => {
            resumed = resolve;
            waiting = true;
        });
        try {
            manager.disableExtension(trigger);
            for (let i = 0; i < 50 && !waiting; i++)
                await wait(100);
            expect(waiting && !extension().stateObj._bar, 'The extension-order reload did not suspend the bar');
            manager.disableExtension(uuid);
            await state(2);
        } finally {
            gate.onEnable = null;
            resumed?.();
        }
        await state(2, trigger);
        expect(!Main.panel.statusArea[uuid], 'A finished reload recreated the disabled bar');
        await disabled({expect, activitiesWasVisible});
        manager.disableExtension(gateId);
        await state(2, gateId);
        manager.enableExtension(uuid);
        await state(1);
        await exercise(extension().stateObj, {wait, expect, phase: 'reenabled'});
        console.log(`RUNTIME-ACCEPTANCE ${uuid}: loaded, exercised, disabled and exercised again`);
    }
}
