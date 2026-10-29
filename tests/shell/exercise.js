import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

let previousActivities;
export async function exercise(extension, {wait, expect, phase}) {
    previousActivities = extension._activitiesWasVisible;
    const mutter = new Gio.Settings({schema_id: 'org.gnome.mutter'});
    const wm = new Gio.Settings({schema_id: 'org.gnome.desktop.wm.preferences'});
    mutter.set_boolean('dynamic-workspaces', false);
    wm.set_int('num-workspaces', 2);
    wm.set_strv('workspace-names', [phase === 'initial' ? 'Runtime One' : 'Runtime Again', 'Runtime Two']);
    await wait(300);
    const bar = Main.panel.statusArea[extension.uuid];
    expect(bar === extension._bar && bar.get_parent(), 'The workspace bar was not attached to the panel');
    for (let i = 0; i < 50; i++) {
        const label = bar._box.get_children()[0]?._label.text;
        if (label === (phase === 'initial' ? 'Runtime One' : 'Runtime Again'))
            break;
        await wait(100);
    }
    const buttons = bar._box.get_children();
    expect(buttons.length === 2, `Expected two real workspace buttons, got ${buttons.length}`);
    expect(buttons[0]._label.text === (phase === 'initial' ? 'Runtime One' : 'Runtime Again'), `A real workspace-name change did not reach the label (${phase}, ${buttons[0]._label.text}, ${JSON.stringify(wm.get_strv('workspace-names'))})`);
    buttons[1].emit('clicked', 1);
    await wait(300);
    expect(global.workspace_manager.get_active_workspace_index() === 1, 'Clicking the second workspace button did not switch workspaces');
    buttons[0].emit('clicked', 1);
    await wait(300);
    expect(global.workspace_manager.get_active_workspace_index() === 0, 'Clicking the first workspace button did not switch back');
}

export async function disabled({expect}) {
    expect(Main.panel.statusArea.activities.visible === previousActivities, 'Disabling did not restore Activities');
}
