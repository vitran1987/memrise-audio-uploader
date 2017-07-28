/**
 * @param {int} maxConcurrentUploads
 * @class
 */
var UploadManager = function (maxConcurrentUploads) {
    this.maxConcurrentUploads = maxConcurrentUploads;
    this.stopping = false;
};

UploadManager.prototype.startAutoUpload = function (progressCallback, doneCallback) {
    var self = this;

    this.stopping = false;
    var rows = $.grep(memriseCourse.initialize(), function (row) {
        return !row.hasSound;
    });

    MESSAGES.GET_LANG_CODE.send({
        languageName: memriseCourse.wordsLanguage
    }, function (response)
    {
        if (response.success)
        {
            var langCode = response.code;
            var uploadsCount = 0;
            var doneCount = 0;
            var rowIndex = 0;

            function startNewUploads() {
                while (uploadsCount < self.maxConcurrentUploads &&
                rowIndex < rows.length &&
                !self.stopping)
                {
                    ++uploadsCount;
                    var uploading = self.uploadForRow(rows[rowIndex], langCode);
                    uploading.always(function () {
                        ++doneCount;
                        --uploadsCount;

                        if (progressCallback)
                            progressCallback(doneCount, rows.length);

                        startNewUploads();
                    });

                    ++rowIndex;
                }

                if ((rowIndex === rows.length ||
                        self.stopping && uploadsCount === 0) &&
                    doneCallback)
                {
                    doneCallback();
                }
            }

            startNewUploads();
        }
        else
            console.log(response.error);
    });
};

UploadManager.prototype.stopUploading = function() {
    this.stopping = true;
};

UploadManager.prototype.base64ToBlob = function(obj) {
    var binary = atob(obj.base64);
    var len = binary.length;
    var buffer = new ArrayBuffer(len);
    var view = new Uint8Array(buffer);
    for (var i = 0; i < len; i++) {
        view[i] = binary.charCodeAt(i);
    }
    return new Blob([view], {type: obj.contentType});
};

UploadManager.prototype.uploadForRow = function(row, languageCode)
{
    var self = this;
    var deferred = $.Deferred();

    MESSAGES.LOAD_SOUND.send({
            word: row.word,
            languageCode: languageCode
        },
        function (response) {
            if (!response || !response.success) {
                deferred.reject();
                return;
            }

            if (row.hasSound)
                return;

            var sound = self.base64ToBlob(response.sound);

            var uploading = memriseCourse.uploadSound(row, sound);

            var removeUploadingMsg = row.audioCellAddUploadingMsg();

            uploading.always(removeUploadingMsg);

            uploading.done(function (response) {
                if (response.success)
                    row.replaceAudioCell(response.rendered);
                else
                    row.audioCellAddErrorMsg();
                deferred.resolve();
            });

            uploading.fail(function () {
                row.audioCellAddErrorMsg();
                deferred.reject();
            });
        });

    return deferred;
};

uploadManager = new UploadManager(3);

