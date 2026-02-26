# Restore Working Tree

Return to the original branch and restore any stashed changes from Step 4:

```bash
git checkout ${ORIGINAL_BRANCH}

# Restore stashed changes if the stash was created in Step 4.
# We look for a stash entry matching the unique REVIEW_ID-tagged message from Step 4.
# If found, we pop it to restore the changes.
STASH_INDEX=$(git stash list | grep -m1 "ah-review-code: auto-stash ${REVIEW_ID}" | sed 's/stash@{\([0-9]*\)}.*/\1/')
if [ -n "$STASH_INDEX" ]; then
  git stash pop stash@{$STASH_INDEX}
fi
```
