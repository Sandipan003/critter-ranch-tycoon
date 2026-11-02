package com.critterranch.tycoon;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.review.ReviewManager;
import com.google.android.play.core.review.ReviewManagerFactory;

// Word of mouth for the game (src/growth.js): the Android share sheet to invite friends, the game's
// Play Store page, and Google Play's in-app review card. Play decides whether the card is shown and
// never reports whether the player rated, so requestReview only says that the flow finished.
@CapacitorPlugin(name = "Growth")
public class GrowthPlugin extends Plugin {

    @PluginMethod
    public void share(PluginCall call) {
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType("text/plain");
        send.putExtra(Intent.EXTRA_TEXT, call.getString("text", ""));
        getActivity().startActivity(Intent.createChooser(send, call.getString("title", "Share")));
        call.resolve();
    }

    @PluginMethod
    public void openStore(PluginCall call) {
        String id = call.getString("id", getContext().getPackageName());
        try {
            getActivity().startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + id)));
        } catch (ActivityNotFoundException e) {
            getActivity().startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=" + id)));
        }
        call.resolve();
    }

    @PluginMethod
    public void requestReview(PluginCall call) {
        ReviewManager manager = ReviewManagerFactory.create(getContext());
        manager.requestReviewFlow().addOnCompleteListener(request -> {
            JSObject done = new JSObject();
            if (!request.isSuccessful()) {
                done.put("flow", false);
                call.resolve(done);
                return;
            }
            manager.launchReviewFlow(getActivity(), request.getResult()).addOnCompleteListener(flow -> {
                done.put("flow", true);
                call.resolve(done);
            });
        });
    }
}
