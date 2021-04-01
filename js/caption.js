'use strict';

var caption = (function () {

  var cap = {};

  function formatSeconds(seconds) {

    //console.log("seconds = "+seconds);
    if(typeof seconds == 'number'){ 
      return new Date(seconds.toFixed(3) * 1000).toISOString().substr(11, 12);
    } else {
      console.log("warning - attempting to format the non number: "+seconds);
      return null;
    }
  }

  cap.init = function(transcriptId, playerId, maxLength, minLength) {
    var transcript = document.getElementById(transcriptId);
    var words = transcript.querySelectorAll('[data-m]');
    var data = {};
    data.segments = [];
    var segmentIndex = 0;

    function segmentMeta(speaker, start, duration, chars) {
      this.speaker = speaker;
      this.start = start;
      this.duration = duration;
      this.chars = chars;
      this.words = [];
    }

    function wordMeta(start, duration, text) {
      this.start = start;
      this.duration = duration;
      this.text = text;
    }

    var thisWordMeta;
    var thisSegmentMeta = null;

    // defaults
    var maxLineLength = 37;
    var minLineLength = 21;

    var captionsVtt = "WEBVTT\n"

    var endSentenceDelimiter = /[\.。?؟!]/g;
    var midSentenceDelimiter = /[,、–，،و:，…‥]/g;

    if (!isNaN(maxLength)) {
      maxLineLength = maxLength;
    }

    if (!isNaN(minLength)) {
      minLineLength = minLength;
    }

    var lastSpeaker = "";
    
    words.forEach(function(word, i) {

      if (thisSegmentMeta === null) {
        // create segment meta object
        thisSegmentMeta = new segmentMeta("", null, 0, 0, 0);
      }

      if (word.classList.contains("speaker")) {

        // checking that this is not a new segment AND a new empty segment wasn't already created
        if (thisSegmentMeta !== null && thisSegmentMeta.start !== null) { 
          //console.log("pushing...");
          //console.log(thisSegmentMeta);
          data.segments.push(thisSegmentMeta); // push the previous segment because it's a new speaker
          thisSegmentMeta = new segmentMeta("", null, 0, 0, 0);
        }

        thisSegmentMeta.speaker = word.innerText;

      } else {

        var thisStart = parseInt(word.getAttribute("data-m"))/1000;
        var thisDuration = parseInt(word.getAttribute("data-d"))/1000;

        if (isNaN(thisStart)) {
          thisStart = 0;
        }
        
        if (isNaN(thisDuration)) {
          thisDuration = 0;
        }

        var thisText = word.innerText;

        thisWordMeta = new wordMeta(thisStart, thisDuration, thisText);
        
        if (thisSegmentMeta.start === null) { 
          thisSegmentMeta.start = thisStart;
          thisSegmentMeta.duration = 0;
          thisSegmentMeta.chars = 0;
        }

        thisSegmentMeta.duration += thisDuration;
        thisSegmentMeta.chars += thisText.length;

        thisSegmentMeta.words.push(thisWordMeta);

        // remove spaces first just in case
        var lastChar = thisText.replace(/\s/g, '').slice(-1);
        if (lastChar.match(endSentenceDelimiter)) {
          data.segments.push(thisSegmentMeta);
          thisSegmentMeta = null;
        }
      }
    });

    //console.log(data.segments);

    function captionMeta(start, stop, text) {
      this.start = start;
      this.stop = stop;
      this.text = text;
    }

    var captions = [];
    var thisCaption = null;

    data.segments.map(function(segment) {

      // If the entire segment fits on a line, add it to the captions.
      if (segment.chars < maxLineLength) {

        thisCaption = new captionMeta(formatSeconds(segment.start), formatSeconds(segment.start + segment.duration), "");
        
        segment.words.forEach(function(wordMeta) {
          thisCaption.text += wordMeta.text;
        });

        thisCaption.text += "\n";
        //console.log("0. pushing because the whole segment fits on a line!");
        //console.log(thisCaption);
        captions.push(thisCaption);
        thisCaption = null;

      } else { // The number of chars in this segment is longer than our single line maximum

        var charCount = 0;
        var lineText = "";
        var firstLine = true;
        var lastOutTime;
        var lastInTime = null;
        
        segment.words.forEach(function(wordMeta, index) {

          var lastChar = wordMeta.text.replace(/\s/g, '').slice(-1);

          if (lastInTime === null) { // if it doesn't exist yet set the caption start time to the word's start time.
            lastInTime = wordMeta.start;
          }

          // Are we over the minimum length of a line and hitting a good place to split mid-sentence?
          if (charCount + wordMeta.text.length > minLineLength && lastChar.match(midSentenceDelimiter)) {

            if (firstLine === true) {

              thisCaption = new captionMeta(formatSeconds(lastInTime), formatSeconds(wordMeta.start + wordMeta.duration), "");
              thisCaption.text += lineText + wordMeta.text + "\n"; 
              
              //check for last word in segment, if it is we can push a one line caption, if not – move on to second line

              if (index + 1 >= segment.words.length) {
                //console.log("1. pushing because we're at a good place to split, we're on the first line but it's the last word of the segment.");
                //console.log(thisCaption);
                captions.push(thisCaption);
                thisCaption = null;
              } else {
                firstLine = false;
              }

            } else { // We're on the second line ... we're over the minimum chars and in a good place to split – let's push the caption

              thisCaption.stop = formatSeconds(wordMeta.start + wordMeta.duration);
              thisCaption.text += lineText + wordMeta.text + "\n";
              //console.log("2. pushing because we're on the second line and have a good place to split");
              //console.log(thisCaption);
              captions.push(thisCaption);
              thisCaption = null;
              firstLine = true;
            }

            // whether first line or not we should reset ready for a new caption
            charCount = 0;
            lineText = "";
            lastInTime = null; 

          } else { // we're not over the minimum length with a suitable splitting point

            // If we add this word are we over the maximum?
            if (charCount + wordMeta.text.length > maxLineLength) {

              if (firstLine === true) {

                if (lastOutTime === undefined) {
                  lastOutTime = wordMeta.start + wordMeta.duration;
                }

                thisCaption = new captionMeta(formatSeconds(lastInTime), formatSeconds(lastOutTime), "");
                thisCaption.text += lineText + "\n";

                // It's just the first line so we should only push a new caption if it's the very last word!

                if (index >= segment.words.length) {
                  captions.push(thisCaption);
                  thisCaption = null;
                } else {
                  firstLine = false;
                }

              } else { // We're on the second line and since we're over the maximum with the next word we should push this caption!

                thisCaption.stop = formatSeconds(lastOutTime);
                thisCaption.text += lineText + "\n";
 
                captions.push(thisCaption);

                thisCaption = null;
                firstLine = true;
              }

              // do the stuff we need to do to start a new line
              charCount = wordMeta.text.length; 
              lineText = wordMeta.text;
              lastInTime = wordMeta.start; // Why do we do this??????

            } else { // We're not over the maximum with this word, update the line length and add the word to the text

              charCount += wordMeta.text.length;
              lineText += wordMeta.text;

            }
          }

          // for every word update the lastOutTime
          lastOutTime = wordMeta.start + wordMeta.duration;
        });
        
        // we're out of words for this segment - decision time!
        if (thisCaption !== null) { // The caption had been started, time to add whatever text we have and add a stop point
          thisCaption.stop = formatSeconds(lastOutTime);
          thisCaption.text += lineText + "\n";
          //console.log("3. pushing at end of segment when new caption HAS BEEN created");
          //console.log(thisCaption);
          captions.push(thisCaption);
          thisCaption = null;
          
        } else { // caption hadn't been started yet - create one!
          if (lastInTime !== null) { 
            thisCaption = new captionMeta(formatSeconds(lastInTime), formatSeconds(lastOutTime), lineText);
            //console.log("4. pushing at end of segment when new caption has yet to be created");
            //console.log(thisCaption);
            captions.push(thisCaption);
            thisCaption = null;  
          }
        }
      }
    });

    captions.forEach(function(caption) {
      captionsVtt += "\n" + caption.start + "-->" + caption.stop + "\n" + caption.text + "\n";
    });

    document.getElementById(playerId+'-vtt').setAttribute("src", 'data:text/vtt,'+encodeURIComponent(captionsVtt));
    console.log(captionsVtt);

  }

  return cap;

});